import { db } from "./db";
import { nextCetDate } from "./date";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  examType: "CET4",
  examDate: nextCetDate(),
  dailyNew: 30,
  dailyMinutes: 30,
  weekendBoost: false,
  createdAt: 0,
  aiKey: "",
  aiBaseUrl: "https://api.deepseek.com",
  aiModel: "deepseek-chat",
  aiMajor: "",
  studyScope: "all",
  newPlanMode: "custom",
  examBufferDays: 14,
  batchReview: 8,
  autoAiMnemonic: false,
};

/** 排课用的时间估算：每张新词卡约 40 秒，每张复习卡约 12 秒 */
export const SECONDS_PER_NEW_WORD = 40;
export const SECONDS_PER_REVIEW = 12;

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get("settings");
  const saved = (row?.value as Partial<Settings>) || {};
  if (!row) {
    const initial: Settings = { ...DEFAULT_SETTINGS, createdAt: Date.now() };
    await db.meta.put({ key: "settings", value: initial });
    return initial;
  }
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch };
  await db.meta.put({ key: "settings", value: next });
  return next;
}

/** 冲刺模式：距离考试 20 天以内 */
export const SPRINT_DAYS = 20;

export function isWeekend(d: Date = new Date()): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** 今日新词目标（含周末加强 / 冲刺模式调整） */
export function dailyNewTarget(s: Settings, daysLeft: number, lagging: number): number {
  let target = s.dailyNew;
  if (s.weekendBoost && isWeekend()) target = Math.round(target * 1.5);
  if (daysLeft <= SPRINT_DAYS) target = Math.max(5, Math.round(s.dailyNew * 0.2));
  else if (lagging > 0) target += Math.min(Math.ceil(lagging / 7), s.dailyNew);
  return Math.max(0, target);
}
