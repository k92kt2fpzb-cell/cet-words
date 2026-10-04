import { createEmptyCard, Rating, State, type Grade } from "ts-fsrs";
import { db, blankProgress } from "./db";
import { addDays, dateKey, dayDiff, daysUntil, todayKey } from "./date";
import { cardFromProgress, isSameSession, scheduler, statusOf } from "./fsrs";
import { SPRINT_DAYS, dailyNewTarget } from "./settings";
import type { Progress, Settings, Word, WordStatus } from "./types";
import { levelField, matchLevel } from "./wordbank";

export interface PlanCounts {
  /** 到期复习 */
  due: number;
  /** 遗忘词（Again 后重新进入学习） */
  lapsed: number;
  /** 顽固词 */
  stubborn: number;
  /** 熟词僻义 */
  poly: number;
  /** 真题高频词 */
  exam: number;
}

export interface TodayPlan {
  daysLeft: number;
  sprint: boolean;
  totalInLevel: number;
  learned: number;
  remaining: number;
  mastered: number;
  learning: number;
  newTarget: number;
  baseTarget: number;
  catchUp: number;
  lagging: number;
  suggestedDaily: number;
  firstRoundDays: number;
  firstRoundDate: string;
  reviewBufferDays: number;
  counts: PlanCounts;
  todayNew: number;
  todayReviews: number;
  todayDurationMs: number;
  todayTotal: number;
  todayDone: number;
}

function isLevel(p: Progress, level: "l4" | "l6"): boolean {
  return (level === "l4" ? p.l4 : p.l6) === 1;
}

export async function buildTodayPlan(s: Settings): Promise<TodayPlan> {
  const now = new Date();
  const nowTs = now.getTime();
  const field = levelField(s.examType);

  const totalInLevelCount = await db.words.where(field).equals(1).count();
  const allProgress = await db.progress.toArray();
  const levelProgress = allProgress.filter((p) => isLevel(p, field));
  const learned = levelProgress.length;
  const remaining = Math.max(0, totalInLevelCount - learned);
  const daysLeft = daysUntil(s.examDate);
  const sprint = daysLeft <= SPRINT_DAYS;

  const startKey = s.createdAt ? dateKey(new Date(s.createdAt)) : todayKey();
  // 只有已经完整过去的计划日才算“落后”，今天的额度尚未到期
  const elapsedFullDays = Math.max(0, dayDiff(startKey, todayKey()));
  const lagging = Math.max(0, elapsedFullDays * s.dailyNew - learned);

  const reviewBufferDays = Math.min(21, Math.max(7, Math.round(Math.max(0, daysLeft) * 0.25)));
  const studyDaysLeft = Math.max(1, daysLeft - reviewBufferDays);
  const suggestedDaily = Math.min(200, Math.max(s.dailyNew, Math.ceil(remaining / studyDaysLeft)));
  const newTarget = Math.min(remaining, dailyNewTarget(s, daysLeft, lagging));
  const catchUp = Math.max(0, newTarget - Math.min(s.dailyNew, newTarget));
  const firstRoundDays = newTarget > 0 ? Math.ceil(remaining / newTarget) : 0;

  const dueAll = levelProgress.filter((p) => p.due <= nowTs);
  const counts: PlanCounts = {
    due: dueAll.length,
    lapsed: dueAll.filter((p) => p.state === State.Relearning).length,
    stubborn: dueAll.filter((p) => p.troublesome === 1).length,
    poly: dueAll.filter((p) => p.poly === 1).length,
    exam: dueAll.filter((p) => p.examCount > 0).length,
  };

  const day = (await db.days.get(todayKey())) ?? { date: todayKey(), newWords: 0, reviews: 0, durationMs: 0 };
  const todayTotal = counts.due + newTarget;
  const todayDone = Math.min(todayTotal, day.newWords + day.reviews);

  return {
    daysLeft,
    sprint,
    totalInLevel: totalInLevelCount,
    learned,
    remaining,
    mastered: levelProgress.filter((p) => statusOf(p) === "mastered").length,
    learning: levelProgress.filter((p) => ["learning", "short", "long", "lapsed"].includes(statusOf(p))).length,
    newTarget,
    baseTarget: s.dailyNew,
    catchUp,
    lagging,
    suggestedDaily,
    firstRoundDays,
    firstRoundDate: dateKey(addDays(now, firstRoundDays)),
    reviewBufferDays: Math.max(0, daysLeft - firstRoundDays),
    counts,
    todayNew: day.newWords,
    todayReviews: day.reviews,
    todayDurationMs: day.durationMs,
    todayTotal,
    todayDone,
  };
}

export type QueueMode = "new" | "due" | "stubborn" | "lapsed" | "exam";

export interface QueueCard {
  word: Word;
  mode: QueueMode;
  isNew: boolean;
  progress?: Progress;
}

export const QUEUE_MODE_LABEL: Record<QueueMode, string> = {
  new: "今日新词",
  due: "到期复习",
  stubborn: "顽固词",
  lapsed: "遗忘词",
  exam: "真题高频",
};

export async function buildLearnQueue(s: Settings, limit: number): Promise<QueueCard[]> {
  if (limit <= 0) return [];
  const field = levelField(s.examType);
  const learned = new Set((await db.progress.toCollection().primaryKeys()) as string[]);
  const pool = await db.words
    .orderBy("priority")
    .reverse()
    .filter((w) => matchLevel(w, s.examType) && !learned.has(w.word.toLowerCase()))
    .limit(limit)
    .toArray();
  return pool.map((w) => ({ word: w, mode: "new" as QueueMode, isNew: true }));
}

function reviewScore(p: Progress, w: Word, sprint: boolean): number {
  let score = 0;
  if (p.troublesome === 1) score += 60;
  if (p.state === State.Relearning) score += 40;
  if (p.lapses > 0) score += 15;
  if (p.poly === 1) score += sprint ? 12 : 6;
  const overdueDays = Math.min(14, Math.max(0, (Date.now() - p.due) / 86400000));
  score += overdueDays * 3;
  score += Math.min(30, w.exam.count) * (sprint ? 2.5 : 1);
  score += w.priority / 500;
  return score;
}

/** 今日复习队列：顽固词 / 遗忘词 优先，其次是逾期最久、真题频率最高的词 */
export async function buildReviewQueue(s: Settings): Promise<QueueCard[]> {
  const nowTs = Date.now();
  const field = levelField(s.examType);
  const due = await db.progress.where("due").belowOrEqual(nowTs).toArray();
  const rows = due.filter((p) => isLevel(p, field));
  const words = await db.words.bulkGet(rows.map((r) => r.wordId));
  const sprint = daysUntil(s.examDate) <= SPRINT_DAYS;

  const items: { card: QueueCard; score: number }[] = [];
  rows.forEach((p, i) => {
    const w = words[i];
    if (!w) return;
    const mode: QueueMode =
      p.troublesome === 1 ? "stubborn" : p.state === State.Relearning ? "lapsed" : w.exam.count > 0 ? "exam" : "due";
    items.push({ card: { word: w, mode, isNew: false, progress: p }, score: reviewScore(p, w, sprint) });
  });
  return items
    .sort((a, b) => b.score - a.score)
    .slice(0, 300)
    .map((it) => it.card);
}

export interface RatingResult {
  progress: Progress;
  dueIn: number;
  requeue: boolean;
}

/** 提交一次记忆反馈（Again/Hard/Good/Easy）并写入 FSRS 调度结果 */
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
  };

  const isNew = !existing;
  const wordCounts = await db.days.get(todayKey());
  const day = wordCounts ?? { date: todayKey(), newWords: 0, reviews: 0, durationMs: 0 };

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
  return { progress: record, dueIn, requeue: isSameSession(dueIn) };
}

export async function toggleFavorite(word: Word): Promise<number> {
  const key = word.word.toLowerCase();
  const existing = await db.progress.get(key);
  if (!existing) {
    const blank = { ...blankProgress(word), favorite: 1, due: Date.now() + 3650 * 86400000, state: State.New, status: "new" as WordStatus };
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

export async function resetAllProgress(): Promise<void> {
  await db.transaction("rw", db.progress, db.logs, db.days, async () => {
    await db.progress.clear();
    await db.logs.clear();
    await db.days.clear();
  });
}
