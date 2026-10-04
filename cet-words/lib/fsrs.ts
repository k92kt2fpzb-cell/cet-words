import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { Progress, WordStatus } from "./types";

export const fsrsParams = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: true,
});

export const scheduler = fsrs(fsrsParams);

export const GRADES = [
  { rating: Rating.Again as number, label: "忘了", en: "Again" },
  { rating: Rating.Hard as number, label: "困难", en: "Hard" },
  { rating: Rating.Good as number, label: "记得", en: "Good" },
  { rating: Rating.Easy as number, label: "很熟", en: "Easy" },
] as const;

export const STATUS_LABEL: Record<WordStatus, string> = {
  new: "未学习",
  learning: "学习中",
  short: "短期记忆",
  long: "长期记忆",
  mastered: "已掌握",
  lapsed: "遗忘",
};

export const STATUS_ORDER: WordStatus[] = ["new", "learning", "short", "long", "mastered", "lapsed"];

export function cardFromProgress(p: Progress): Card {
  return {
    due: new Date(p.due),
    stability: p.stability,
    difficulty: p.difficulty,
    elapsed_days: p.elapsedDays,
    scheduled_days: p.scheduledDays,
    reps: p.reps,
    lapses: p.lapses,
    learning_steps: p.learningSteps ?? 0,
    state: p.state as State,
    last_review: p.lastReview ? new Date(p.lastReview) : undefined,
  } as Card;
}

export function statusOf(p?: Pick<Progress, "state" | "stability"> | null): WordStatus {
  if (!p) return "new";
  if (p.state === State.Relearning) return "lapsed";
  if (p.state === State.New || p.state === State.Learning) return "learning";
  if (p.stability < 21) return "short";
  if (p.stability < 90) return "long";
  return "mastered";
}

/** 四档评分的预计间隔文本 */
export function previewIntervals(p: Progress | undefined, now: Date = new Date()) {
  const card = p ? cardFromProgress(p) : createEmptyCard(now);
  const record = scheduler.repeat(card, now);
  return GRADES.map((g) => {
    const item = record[g.rating as Grade];
    const due = item.card.due.getTime();
    return { rating: g.rating, due, text: humanInterval(due - now.getTime()) };
  });
}

/** 当前记忆保持率（0-1） */
export function retrievability(p: Progress, now: Date = new Date()): number {
  if (!p || p.state === State.New || !p.lastReview) return 0;
  try {
    const value = scheduler.get_retrievability(cardFromProgress(p), now, false);
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : 0;
  } catch {
    return 0;
  }
}

export function humanInterval(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} 分钟`;
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(ms / 86400000);
  if (days < 30) return `${days} 天`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} 个月`;
  return `${(days / 365).toFixed(1)} 年`;
}

/** 学习中的卡片会在本次学习中再次出现 */
export function isSameSession(dueIn: number): boolean {
  return dueIn <= 45 * 60000;
}

export { Rating, State };
