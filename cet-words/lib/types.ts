export type Level = "CET4" | "CET6";

export interface WordSense {
  pos: string;
  cn: string;
  en: string;
}

export interface Sentence {
  en: string;
  cn: string;
}

export interface Phrase {
  en: string;
  cn: string;
}

export interface SynoGroup {
  pos: string;
  tran: string;
  ws: string[];
}

export interface RootGroup {
  pos: string;
  words: { hwd: string; tran: string }[];
}

export interface ExamSentence {
  en: string;
  type: string;
  year: string;
}

export interface ExamInfo {
  count: number;
  byType: Record<string, number>;
  years: string[];
  sentences: ExamSentence[];
}

/** 词库中的单词（public/data/wordbank.json -> IndexedDB words 表） */
export interface Word {
  id: number;
  word: string;
  uk: string;
  us: string;
  trans: WordSense[];
  sentences: Sentence[];
  phrases: Phrase[];
  syno: SynoGroup[];
  antos: string[];
  roots: RootGroup[];
  rem: string;
  star: number;
  rank: number;
  levels: Level[];
  exam: ExamInfo;
  senseCount: number;
  posCount: number;
  poly: boolean;
  priority: number;
  l4: number;
  l6: number;
}

export type WordStatus = "new" | "learning" | "short" | "long" | "mastered" | "lapsed";

/** 单词索引（单词本列表 / 搜索用，不含例句等大字段） */
export interface WordIndexRow {
  id: number;
  word: string;
  priority: number;
  l4: number;
  l6: number;
  poly: number;
  examCount: number;
}

/** 用户学习数据（IndexedDB progress 表），主键为小写单词 */
export interface Progress {
  word: string;
  wordId: number;
  /** 冗余自词库，用于按级别/题型快速统计（0/1） */
  l4: number;
  l6: number;
  poly: number;
  examCount: number;
  status: WordStatus;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: number;
  lastReview: number | null;
  firstLearnedAt: number;
  updatedAt: number;
  favorite: number;
  troublesome: number;
  againCount: number;
  hardStreak: number;
  goodStreak: number;
  totalReviews: number;
}

export interface ReviewLog {
  id?: number;
  word: string;
  wordId: number;
  ts: number;
  rating: number;
  mode: "learn" | "review";
  durationMs: number;
}

export interface DayStat {
  date: string;
  newWords: number;
  reviews: number;
  durationMs: number;
}

export interface Settings {
  examType: Level;
  examDate: string;
  dailyNew: number;
  dailyMinutes: number;
  weekendBoost: boolean;
  createdAt: number;
}
