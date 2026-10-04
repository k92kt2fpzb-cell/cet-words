import { db } from "./db";
import { addDays, dateKey, todayKey } from "./date";
import { retrievability, statusOf } from "./fsrs";
import type { DayStat, Settings, WordStatus } from "./types";
import { levelField } from "./wordbank";

export async function getDay(key: string = todayKey()): Promise<DayStat> {
  return (await db.days.get(key)) ?? { date: key, newWords: 0, reviews: 0, durationMs: 0 };
}

/** 最近 n 天（含今天）的每日数据 */
export async function recentDays(n: number): Promise<DayStat[]> {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) keys.push(dateKey(addDays(now, -i)));
  const rows = await db.days.bulkGet(keys);
  return keys.map((k, i) => rows[i] ?? { date: k, newWords: 0, reviews: 0, durationMs: 0 });
}

/** 连续学习天数（今天还没学时从昨天开始算，避免早上断签） */
export function computeStreak(days: DayStat[]): number {
  const active = new Set(days.filter((d) => d.newWords + d.reviews > 0).map((d) => d.date));
  if (active.size === 0) return 0;
  let cursor = new Date();
  if (!active.has(dateKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!active.has(dateKey(cursor))) return 0;
  }
  let streak = 0;
  while (active.has(dateKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface LoadPoint {
  date: string;
  count: number;
}

/** 未来 n 天每天的复习量 */
export async function futureLoad(n = 7): Promise<LoadPoint[]> {
  const rows = await db.progress.toArray();
  const base = new Date();
  const points: LoadPoint[] = [];
  for (let i = 0; i < n; i++) {
    const key = dateKey(addDays(base, i));
    const start = addDays(base, i).setHours(0, 0, 0, 0);
    const end = addDays(base, i).setHours(23, 59, 59, 999);
    const count = rows.filter((p) => {
      if (p.state === 0 && p.reps === 0) return false;
      const ts = i === 0 ? Math.min(p.due, end) : p.due;
      return ts >= start && ts <= end;
    }).length;
    points.push({ date: key, count });
  }
  return points;
}

/** 预计记忆保持率 */
export async function retentionRate(): Promise<number> {
  const rows = (await db.progress.toArray()).filter((p) => p.state !== 0 && p.reps > 0);
  if (!rows.length) return 0;
  const now = new Date();
  const sum = rows.reduce((acc, p) => acc + retrievability(p, now), 0);
  return sum / rows.length;
}

export interface StatusCounts extends Record<WordStatus, number> {}

export async function statusCounts(s: Settings): Promise<StatusCounts> {
  const field = levelField(s.examType);
  const rows = (await db.progress.toArray()).filter((p) => (field === "l4" ? p.l4 : p.l6) === 1);
  const counts: StatusCounts = { new: 0, learning: 0, short: 0, long: 0, mastered: 0, lapsed: 0 };
  for (const p of rows) counts[statusOf(p)]++;
  const total = await db.words.where(field).equals(1).count();
  counts.new = Math.max(0, total - rows.length);
  return counts;
}

export interface CurvePoint {
  date: string;
  newWords: number;
  reviews: number;
}

export async function curveData(range: "7" | "30" | "all"): Promise<CurvePoint[]> {
  if (range === "all") {
    const rows = await db.days.orderBy("date").toArray();
    return rows.filter((d) => d.newWords + d.reviews > 0);
  }
  const n = range === "7" ? 7 : 30;
  const rows = await recentDays(n);
  return rows.map((d) => ({ date: d.date, newWords: d.newWords, reviews: d.reviews }));
}

export async function lifetimeTotals(): Promise<{ newWords: number; reviews: number; durationMs: number; activeDays: number }> {
  const rows = await db.days.toArray();
  const active = rows.filter((d) => d.newWords + d.reviews > 0);
  return {
    newWords: rows.reduce((a, d) => a + d.newWords, 0),
    reviews: rows.reduce((a, d) => a + d.reviews, 0),
    durationMs: rows.reduce((a, d) => a + d.durationMs, 0),
    activeDays: active.length,
  };
}

/** 熟词僻义专项掌握率（多义项且多词性的词） */
export async function polyStats(s: Settings): Promise<{ total: number; learned: number; mastered: number }> {
  const field = levelField(s.examType);
  const total = await db.index
    .where(field)
    .equals(1)
    .filter((r) => r.poly === 1)
    .count();
  const rows = (await db.progress.toArray()).filter(
    (p) => (field === "l4" ? p.l4 : p.l6) === 1 && (p.poly === 1 || p.polyManual === 1),
  );
  return {
    total,
    learned: rows.length,
    mastered: rows.filter((p) => ["mastered", "long"].includes(statusOf(p))).length,
  };
}

