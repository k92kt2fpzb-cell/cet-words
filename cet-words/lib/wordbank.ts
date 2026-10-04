import { db } from "./db";
import type { Level, StudyScope, Word } from "./types";

const BANK_KEY = "bank";

export function levelField(level: Level): "l4" | "l6" {
  return level === "CET4" ? "l4" : "l6";
}

/** 判断一个单词是否属于当前备考范围：六级默认把四级词汇也算上 */
export function levelOk(flags: { l4: number; l6: number }, level: Level, includeBase: boolean): boolean {
  if (level === "CET4") return flags.l4 === 1;
  return flags.l6 === 1 || (includeBase && flags.l4 === 1);
}

export function levelLabel(level: Level, includeBase: boolean): string {
  if (level === "CET4") return "CET-4";
  return includeBase ? "CET-6（含四级词汇）" : "CET-6（仅六级新增词）";
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
  const data = (await res.json()) as { count: number; generatedAt: string; words: Word[] };
  const meta = await db.meta.get(BANK_KEY);
  const saved = meta?.value as { count?: number; version?: string } | undefined;
  if (saved?.version === data.generatedAt && (await db.words.count()) === data.count) {
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
        tier: w.tier ?? 6,
        weighted: w.weighted ?? w.exam.count,
      })),
    );
    onProgress?.(Math.min(i + BATCH, words.length), words.length);
  }
  // 词库重建后 word id 会变化：同步 progress 里的 wordId，避免复习队列取错词
  const idByWord = new Map(words.map((w) => [w.word.toLowerCase(), w.id]));
  const rows = await db.progress.toArray();
  const updates = rows
    .filter((r) => idByWord.has(r.word) && idByWord.get(r.word) !== r.wordId)
    .map((r) => ({ ...r, wordId: idByWord.get(r.word) as number }));
  if (updates.length) await db.progress.bulkPut(updates);

  await db.meta.put({
    key: BANK_KEY,
    value: { count: data.count, version: data.generatedAt, loadedAt: Date.now() },
  });
  return { total: data.count, imported: true };
}

export async function totalInLevel(level: Level): Promise<number> {
  return db.words.where(levelField(level)).equals(1).count();
}

/** 词单（学习范围）：把词库切成用户可选的几个包 */
export const STUDY_SCOPES: { key: StudyScope; label: string; desc: string }[] = [
  { key: "all", label: "考纲全量", desc: "该级别词库的全部单词，适合时间充裕、想全面覆盖" },
  { key: "core", label: "高频重点", desc: "真题高频 + 核心词（分层 1-2 级），性价比最高，推荐" },
  { key: "sprint", label: "考前急救", desc: "最高频真题词 + 熟词僻义，约 500 词，适合考前两周" },
  { key: "exam", label: "真题词", desc: "近十年四六级真题里出现过的单词" },
  { key: "poly", label: "熟词僻义专项", desc: "认识但容易考偏释义的单词，单独突破" },
];

export function scopeMatch(
  row: { tier?: number; poly?: number; examCount?: number },
  scope: StudyScope,
): boolean {
  const tier = row.tier ?? 6;
  switch (scope) {
    case "core":
      return tier <= 2;
    case "sprint":
      return tier === 1 || (row.poly ?? 0) === 1;
    case "exam":
      return (row.examCount ?? 0) > 0;
    case "poly":
      return (row.poly ?? 0) === 1;
    default:
      return true;
  }
}

export function scopeLabel(scope: StudyScope): string {
  return STUDY_SCOPES.find((s) => s.key === scope)?.label ?? "考纲全量";
}

export function scopeMatchWord(w: Word, scope: StudyScope): boolean {
  return scopeMatch({ tier: w.tier, poly: w.poly ? 1 : 0, examCount: w.exam.count }, scope);
}

/** 当前级别下各词单的单词数量 */
export async function scopeCounts(level: Level, includeBase = false): Promise<Record<StudyScope, number>> {
  const rows = (await db.index.toArray()).filter((r) => levelOk(r, level, includeBase));
  const counts: Record<StudyScope, number> = { all: rows.length, core: 0, sprint: 0, exam: 0, poly: 0 };
  for (const row of rows) {
    if (scopeMatch(row, "core")) counts.core += 1;
    if (scopeMatch(row, "sprint")) counts.sprint += 1;
    if (scopeMatch(row, "exam")) counts.exam += 1;
    if (scopeMatch(row, "poly")) counts.poly += 1;
  }
  return counts;
}
