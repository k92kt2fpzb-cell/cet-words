import { db } from "./db";
import type { Level, Word } from "./types";

const BANK_KEY = "bank";

export function levelField(level: Level): "l4" | "l6" {
  return level === "CET4" ? "l4" : "l6";
}

export function matchLevel(w: Word, level: Level): boolean {
  return (level === "CET4" ? w.l4 : w.l6) === 1;
}

/**
 * 首次运行（或词库版本变化）时把 public/data/wordbank.json 导入 IndexedDB。
 * 学习进度单独存在 progress 表，更新词库不会丢失进度。
 */
export async function ensureBankLoaded(
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ total: number; imported: boolean }> {
  const res = await fetch("/data/wordbank.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`词库加载失败: ${res.status}`);
  const data = (await res.json()) as { count: number; words: Word[] };
  const meta = await db.meta.get(BANK_KEY);
  const savedCount = (meta?.value as { count?: number } | undefined)?.count;
  if (savedCount === data.count && (await db.words.count()) === data.count) {
    return { total: data.count, imported: false };
  }

  const words = data.words.map((w) => ({
    ...w,
    l4: w.levels.includes("CET4") ? 1 : 0,
    l6: w.levels.includes("CET6") ? 1 : 0,
  }));
  await db.words.clear();
  await db.index.clear();
  const BATCH = 400;
  for (let i = 0; i < words.length; i += BATCH) {
    await db.words.bulkPut(words.slice(i, i + BATCH));
    await db.index.bulkPut(
      words.slice(i, i + BATCH).map((w) => ({
        id: w.id,
        word: w.word,
        priority: w.priority,
        l4: w.l4,
        l6: w.l6,
        poly: w.poly ? 1 : 0,
        examCount: w.exam.count,
      })),
    );
    onProgress?.(Math.min(i + BATCH, words.length), words.length);
  }
  await db.meta.put({ key: BANK_KEY, value: { count: data.count, loadedAt: Date.now() } });
  return { total: data.count, imported: true };
}

export async function totalInLevel(level: Level): Promise<number> {
  return db.words.where(levelField(level)).equals(1).count();
}
