import { createEmptyCard, Rating, State, type Grade } from "ts-fsrs";
import { blankProgress, db } from "./db";
import { addDays, dateKey, dayDiff, daysUntil, todayKey } from "./date";
import { cardFromProgress, retrievability, scheduler, statusOf } from "./fsrs";
import { SECONDS_PER_NEW_WORD, SECONDS_PER_REVIEW, SPRINT_DAYS, dailyNewTarget } from "./settings";
import type { NewPlanMode, Progress, Settings, StudyScope, Word, WordStatus } from "./types";
import { levelField, matchLevel, scopeLabel, scopeMatch, scopeMatchWord } from "./wordbank";

export interface PlanCounts {
  /** 到期复习 */
  due: number;
  /** 没有到期卡片时的“巩固复习”（记忆最弱的已学单词） */
  extra: number;
  /** 遗忘词（Again 后重新进入学习） */
  lapsed: number;
  /** 顽固词 */
  stubborn: number;
  /** 熟词僻义 */
  poly: number;
  /** 真题高频词 */
  exam: number;
}

export interface TimeBudget {
  minutes: number;
  reviewMinutes: number;
  newMinutes: number;
  usedMinutes: number;
  newCap: number;
  capped: boolean;
  over: boolean;
}

export interface TodayPlan {
  daysLeft: number;
  sprint: boolean;
  scope: StudyScope;
  scopeName: string;
  scopedTotal: number;
  baseTotal: number;
  learned: number;
  remaining: number;
  mastered: number;
  learning: number;
  newTarget: number;
  rawNewTarget: number;
  baseTarget: number;
  catchUp: number;
  lagging: number;
  suggestedDaily: number;
  perDayNeeded: number;
  planMode: NewPlanMode;
  minNewApplied: boolean;
  firstRoundDays: number;
  firstRoundDate: string;
  reviewBufferDays: number;
  counts: PlanCounts;
  todayNew: number;
  todayReviews: number;
  todayDurationMs: number;
  todayTotal: number;
  todayDone: number;
  timeBudget: TimeBudget;
}

function isLevel(p: Progress, level: "l4" | "l6"): boolean {
  return (level === "l4" ? p.l4 : p.l6) === 1;
}

const EXTRA_REVIEW_MAX = 8;

/** 没有到期卡片时，挑记忆保持率最低的已学单词做巩固复习（保证每天都有复习） */
export function pickExtraReview(rows: Progress[], n = EXTRA_REVIEW_MAX): Progress[] {
  const now = new Date();
  return rows
    .filter((p) => p.reps > 0 && p.state !== State.New)
    .map((p) => ({ p, r: retrievability(p, now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, n)
    .map((item) => item.p);
}

export async function buildTodayPlan(s: Settings): Promise<TodayPlan> {
  const now = new Date();
  const nowTs = now.getTime();
  const field = levelField(s.examType);

  const baseTotal = await db.words.where(field).equals(1).count();
  const indexRows = await db.index.where(field).equals(1).toArray();
  const scopeRows = indexRows.filter((r) => scopeMatch(r, s.studyScope));
  const scopedTotal = scopeRows.length;

  const allProgress = await db.progress.toArray();
  const levelProgress = allProgress.filter((p) => isLevel(p, field));
  const learnedWords = new Set(levelProgress.map((p) => p.word));
  const remainingInScope = scopeRows.filter((r) => !learnedWords.has(r.word.toLowerCase())).length;
  const learned = Math.max(0, scopedTotal - remainingInScope);
  const remaining = remainingInScope;

  const daysLeft = daysUntil(s.examDate);
  const sprint = daysLeft <= SPRINT_DAYS;

  const startKey = s.createdAt ? dateKey(new Date(s.createdAt)) : todayKey();
  // 只有已经完整过去的计划日才算“落后”，今天的额度尚未到期
  const elapsedFullDays = Math.max(0, dayDiff(startKey, todayKey()));
  const lagging = Math.max(0, elapsedFullDays * s.dailyNew - learned);

  const reviewBufferDays = Math.min(21, Math.max(7, Math.round(Math.max(0, daysLeft) * 0.25)));
  const studyDaysLeft = Math.max(1, daysLeft - reviewBufferDays);
  const suggestedDaily = Math.min(200, Math.max(s.dailyNew, Math.ceil(remaining / studyDaysLeft)));

  // “考前背完”模式：按剩余天数倒推每天必须学多少
  const perDayNeeded = remaining > 0 ? Math.ceil(remaining / Math.max(1, daysLeft - s.examBufferDays)) : 0;
  const planned =
    s.newPlanMode === "exam"
      ? Math.min(200, perDayNeeded)
      : Math.min(remaining, dailyNewTarget(s, daysLeft, lagging));

  const dueRows = levelProgress.filter((p) => p.due <= nowTs);
  // 每天都要有新学 + 复习：没有到期卡片时安排巩固复习
  const extraRows = dueRows.length === 0 ? pickExtraReview(levelProgress) : [];
  const counts: PlanCounts = {
    due: dueRows.length,
    extra: extraRows.length,
    lapsed: dueRows.filter((p) => p.state === State.Relearning).length,
    stubborn: dueRows.filter((p) => p.troublesome === 1).length,
    poly: dueRows.filter((p) => p.poly === 1 || p.polyManual === 1).length,
    exam: dueRows.filter((p) => p.examCount > 0).length,
  };

  const reviewCount = counts.due + counts.extra;
  const reviewMinutes = (reviewCount * SECONDS_PER_REVIEW) / 60;
  const newCap = Math.floor((Math.max(0, s.dailyMinutes - reviewMinutes) * 60) / SECONDS_PER_NEW_WORD);

  // 每天至少 5 个新词（词单还没学完、且时间预算允许时）
  const minNew = Math.min(5, remaining);
  const rawNewTarget = Math.min(planned, remaining);
  const newTarget = Math.max(0, Math.min(Math.max(planned, minNew), newCap, remaining));
  const minNewApplied = newTarget > rawNewTarget;
  const catchUp = Math.max(0, newTarget - Math.min(s.dailyNew, newTarget));
  const firstRoundDays = newTarget > 0 ? Math.ceil(remaining / newTarget) : 0;

  const timeBudget: TimeBudget = {
    minutes: s.dailyMinutes,
    reviewMinutes: Math.round(reviewMinutes),
    newMinutes: Math.round((newTarget * SECONDS_PER_NEW_WORD) / 60),
    usedMinutes: Math.round(reviewMinutes + (newTarget * SECONDS_PER_NEW_WORD) / 60),
    newCap,
    capped: newTarget < Math.max(planned, minNew),
    over: reviewMinutes >= s.dailyMinutes,
  };

  const day = (await db.days.get(todayKey())) ?? { date: todayKey(), newWords: 0, reviews: 0, durationMs: 0 };
  const todayTotal = reviewCount + newTarget;
  const todayDone = Math.min(todayTotal, day.newWords + day.reviews);

  return {
    daysLeft,
    sprint,
    scope: s.studyScope,
    scopeName: scopeLabel(s.studyScope),
    scopedTotal,
    baseTotal,
    learned,
    remaining,
    mastered: levelProgress.filter((p) => statusOf(p) === "mastered").length,
    learning: levelProgress.filter((p) => ["learning", "short", "long", "lapsed"].includes(statusOf(p))).length,
    newTarget,
    rawNewTarget,
    baseTarget: s.dailyNew,
    catchUp,
    lagging,
    suggestedDaily,
    perDayNeeded,
    planMode: s.newPlanMode,
    minNewApplied,
    firstRoundDays,
    firstRoundDate: dateKey(addDays(now, firstRoundDays)),
    reviewBufferDays: Math.max(0, daysLeft - firstRoundDays),
    counts,
    todayNew: day.newWords,
    todayReviews: day.reviews,
    todayDurationMs: day.durationMs,
    todayTotal,
    todayDone,
    timeBudget,
  };
}

export type QueueMode = "new" | "due" | "extra" | "stubborn" | "lapsed" | "exam";

export interface QueueCard {
  word: Word;
  mode: QueueMode;
  isNew: boolean;
  progress?: Progress;
}

export const QUEUE_MODE_LABEL: Record<QueueMode, string> = {
  new: "今日新词",
  due: "到期复习",
  extra: "巩固复习",
  stubborn: "顽固词",
  lapsed: "遗忘词",
  exam: "真题高频",
};

export async function buildLearnQueue(s: Settings, limit: number): Promise<QueueCard[]> {
  if (limit <= 0) return [];
  const learned = new Set((await db.progress.toCollection().primaryKeys()) as string[]);
  const pool = await db.words
    .orderBy("priority")
    .reverse()
    .filter((w) => matchLevel(w, s.examType) && scopeMatchWord(w, s.studyScope) && !learned.has(w.word.toLowerCase()))
    .limit(limit)
    .toArray();
  return pool.map((w) => ({ word: w, mode: "new" as QueueMode, isNew: true }));
}

function reviewScore(p: Progress, w: Word, sprint: boolean): number {
  let score = 0;
  if (p.troublesome === 1) score += 60;
  if (p.state === State.Relearning) score += 40;
  if (p.lapses > 0) score += 15;
  if (p.poly === 1 || p.polyManual === 1) score += sprint ? 12 : 6;
  const overdueDays = Math.min(14, Math.max(0, (Date.now() - p.due) / 86400000));
  score += overdueDays * 3;
  score += Math.min(30, w.exam.count) * (sprint ? 2.5 : 1);
  score += w.priority / 500;
  return score;
}

export interface SprintMixRow {
  label: string;
  target: number;
  actual: number;
}

export interface ReviewQueueResult {
  cards: QueueCard[];
  sprint: boolean;
  capacity: number;
  mix: SprintMixRow[];
}

/** 冲刺模式配额（对应产品文档 §9 的推荐权重） */
const SPRINT_MIX = [
  { key: "high", label: "高频词", ratio: 0.3 },
  { key: "wrong", label: "错词", ratio: 0.2 },
  { key: "lapsed", label: "遗忘词", ratio: 0.2 },
  { key: "exam", label: "真题词", ratio: 0.15 },
  { key: "poly", label: "熟词僻义", ratio: 0.1 },
] as const;

function bucketOf(p: Progress, w: Word): string {
  if (p.state === State.Relearning) return "lapsed";
  if (p.lapses > 0) return "wrong";
  if (p.poly === 1 || p.polyManual === 1) return "poly";
  if ((w.tier ?? 6) <= 2) return "high";
  if (w.exam.count > 0) return "exam";
  return "core";
}

export async function buildReviewQueue(s: Settings): Promise<ReviewQueueResult> {
  const nowTs = Date.now();
  const field = levelField(s.examType);
  const allProgress = await db.progress.toArray();
  const levelRows = allProgress.filter((p) => isLevel(p, field));
  const dueRows = levelRows.filter((p) => p.due <= nowTs);
  // 每天都要有复习：没有到期的词时，挑记忆最弱的巩固一下
  const extraRows = dueRows.length === 0 ? pickExtraReview(levelRows) : [];
  const entries = [
    ...dueRows.map((p) => ({ p, extra: false })),
    ...extraRows.map((p) => ({ p, extra: true })),
  ];
  if (!entries.length) {
    return { cards: [], sprint: false, capacity: 0, mix: [] };
  }

  const words = await db.words.bulkGet(entries.map((e) => e.p.wordId));
  const sprint = daysUntil(s.examDate) <= SPRINT_DAYS;

  const items: { card: QueueCard; score: number; bucket: string }[] = [];
  entries.forEach((e, i) => {
    const w = words[i];
    if (!w) return;
    const mode: QueueMode = e.extra
      ? "extra"
      : e.p.troublesome === 1
        ? "stubborn"
        : e.p.state === State.Relearning
          ? "lapsed"
          : w.exam.count > 0
            ? "exam"
            : "due";
    items.push({
      card: { word: w, mode, isNew: false, progress: e.p },
      score: reviewScore(e.p, w, sprint),
      bucket: bucketOf(e.p, w),
    });
  });
  items.sort((a, b) => b.score - a.score);

  if (!sprint) {
    return { cards: items.slice(0, 300).map((it) => it.card), sprint: false, capacity: items.length, mix: [] };
  }

  // 冲刺阶段按配额组卷，容量按每日学习时间折算（每分钟约 5 张复习卡）
  const capacity = Math.min(items.length, Math.max(20, Math.round(s.dailyMinutes * 5)));
  const targets = SPRINT_MIX.map((m) => ({
    key: m.key as string,
    label: m.label,
    target: Math.round(capacity * m.ratio),
  }));
  const picked: typeof items = [];
  const used: Record<string, number> = {};
  for (const t of targets) {
    for (const it of items) {
      if (it.bucket !== t.key || picked.includes(it)) continue;
      if ((used[t.key] ?? 0) >= t.target) break;
      picked.push(it);
      used[t.key] = (used[t.key] ?? 0) + 1;
    }
  }
  for (const it of items) {
    if (picked.length >= capacity) break;
    if (!picked.includes(it)) picked.push(it);
  }
  picked.sort((a, b) => b.score - a.score);
  return {
    cards: picked.slice(0, capacity).map((it) => it.card),
    sprint: true,
    capacity,
    mix: targets.map((t) => ({ label: t.label, target: t.target, actual: used[t.key] ?? 0 })),
  };
}

export interface RatingResult {
  progress: Progress;
  dueIn: number;
  requeue: boolean;
}

/** 提交一次记忆反馈并写入 FSRS 调度结果 */
export async function recordRating(opts: {
  word: Word;
  rating: number;
  mode: "learn" | "review";
  durationMs: number;
}): Promise<RatingResult> {
  const now = new Date();
  const key = opts.word.word.toLowerCase();
  const existing = await db.progress.get(key);
  const card = existing ? cardFromProgress(existing) : createEmptyCard(now);
  const { card: next } = scheduler.next(card, now, opts.rating as Grade);

  const againCount = (existing?.againCount ?? 0) + (opts.rating === Rating.Again ? 1 : 0);
  const hardStreak = opts.rating === Rating.Hard ? (existing?.hardStreak ?? 0) + 1 : 0;
  const goodStreak = opts.rating >= Rating.Good ? (existing?.goodStreak ?? 0) + 1 : 0;

  let troublesome = existing?.troublesome ?? 0;
  if (againCount >= 3 || (againCount >= 2 && (existing?.hardStreak ?? 0) >= 2)) troublesome = 1;
  if (goodStreak >= 3) troublesome = 0;

  const record: Progress = {
    ...(existing ?? blankProgress(opts.word)),
    word: key,
    wordId: opts.word.id,
    l4: opts.word.l4,
    l6: opts.word.l6,
    poly: opts.word.poly ? 1 : 0,
    examCount: opts.word.exam.count,
    status: statusOf({ state: next.state, stability: next.stability }),
    due: next.due.getTime(),
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    reps: next.reps,
    lapses: next.lapses,
    learningSteps: next.learning_steps ?? 0,
    state: next.state,
    lastReview: now.getTime(),
    firstLearnedAt: existing?.firstLearnedAt || now.getTime(),
    updatedAt: now.getTime(),
    againCount,
    hardStreak,
    goodStreak,
    totalReviews: (existing?.totalReviews ?? 0) + 1,
    polyManual: existing?.polyManual ?? 0,
  };

  const isNew = !existing;
  const todayRow = await db.days.get(todayKey());
  const day = todayRow ?? { date: todayKey(), newWords: 0, reviews: 0, durationMs: 0 };

  await db.transaction("rw", db.progress, db.logs, db.days, async () => {
    await db.progress.put(record);
    await db.logs.add({
      word: key,
      wordId: opts.word.id,
      ts: now.getTime(),
      rating: opts.rating,
      mode: opts.mode,
      durationMs: opts.durationMs,
    });
    await db.days.put({
      ...day,
      newWords: day.newWords + (isNew ? 1 : 0),
      reviews: day.reviews + (isNew ? 0 : 1),
      durationMs: day.durationMs + opts.durationMs,
    });
  });

  const dueIn = next.due.getTime() - now.getTime();
  return { progress: record, dueIn, requeue: true };
}

export async function toggleFavorite(word: Word): Promise<number> {
  const key = word.word.toLowerCase();
  const existing = await db.progress.get(key);
  if (!existing) {
    const blank = {
      ...blankProgress(word),
      favorite: 1,
      due: Date.now() + 3650 * 86400000,
      state: State.New,
      status: "new" as WordStatus,
    };
    await db.progress.put(blank);
    return 1;
  }
  const value = existing.favorite === 1 ? 0 : 1;
  await db.progress.put({ ...existing, favorite: value, updatedAt: Date.now() });
  return value;
}

export async function setTroublesome(word: Word, value: boolean): Promise<void> {
  const key = word.word.toLowerCase();
  const existing = await db.progress.get(key);
  const base = existing ?? { ...blankProgress(word), due: Date.now() + 3650 * 86400000 };
  await db.progress.put({ ...base, troublesome: value ? 1 : 0, updatedAt: Date.now() });
}

/** 手动把单词加入 / 移出“熟词僻义专项” */
export async function setPolyManual(word: Word, value: boolean): Promise<void> {
  const key = word.word.toLowerCase();
  const existing = await db.progress.get(key);
  const base = existing ?? { ...blankProgress(word), due: Date.now() + 3650 * 86400000 };
  await db.progress.put({ ...base, polyManual: value ? 1 : 0, updatedAt: Date.now() });
}

export async function resetAllProgress(): Promise<void> {
  await db.transaction("rw", db.progress, db.logs, db.days, async () => {
    await db.progress.clear();
    await db.logs.clear();
    await db.days.clear();
  });
}
