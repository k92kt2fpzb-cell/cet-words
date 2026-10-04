import Dexie, { type Table } from "dexie";
import type { AiCacheRow, DayStat, Progress, ReviewLog, Word, WordIndexRow } from "./types";

interface MetaRow {
  key: string;
  value: unknown;
}

export class CetWordsDB extends Dexie {
  words!: Table<Word, number>;
  index!: Table<WordIndexRow, number>;
  progress!: Table<Progress, string>;
  logs!: Table<ReviewLog, number>;
  days!: Table<DayStat, string>;
  meta!: Table<MetaRow, string>;
  ai!: Table<AiCacheRow, string>;

  constructor() {
    super("cet-words");
    this.version(1).stores({
      words: "id, word, priority, l4, l6",
      index: "id, word, priority, l4, l6, poly, examCount",
      progress: "word, wordId, due, state, favorite, troublesome, updatedAt, l4, l6, poly",
      logs: "++id, word, wordId, ts, mode, rating",
      days: "date",
      meta: "key",
    });
    this.version(2).stores({
      words: "id, word, priority, l4, l6",
      index: "id, word, priority, l4, l6, poly, examCount, tier",
      progress: "word, wordId, due, state, favorite, troublesome, updatedAt, l4, l6, poly",
      logs: "++id, word, wordId, ts, mode, rating",
      days: "date",
      meta: "key",
      ai: "key, word, task, updatedAt",
    });
  }
}

export const db = new CetWordsDB();

/** 空进度对象（用于计算，不落库） */
export function blankProgress(word: Word): Progress {
  return {
    word: word.word.toLowerCase(),
    wordId: word.id,
    l4: word.l4,
    l6: word.l6,
    poly: word.poly ? 1 : 0,
    examCount: word.exam.count,
    status: "new",
    due: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    state: 0,
    lastReview: null,
    firstLearnedAt: 0,
    updatedAt: 0,
    favorite: 0,
    troublesome: 0,
    againCount: 0,
    hardStreak: 0,
    goodStreak: 0,
    totalReviews: 0,
    polyManual: 0,
  };
}
