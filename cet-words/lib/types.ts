export type Level = "CET4" | "CET6";

/** 词单（学习范围）：同一级别下可选的词汇包 */
export type StudyScope = "all" | "core" | "sprint" | "exam" | "poly";

/** 每日新词数量的决定方式 */
export type NewPlanMode = "custom" | "exam";

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
  /** 题型加权真题分（阅读 1.0 / 听力 0.9 / 写作 0.8 / 文本 0.7） */
  weighted: number;
  /** 考试优先级分层：1 高频真题词 → 6 低频词 */
  tier: number;
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
  tier: number;
  weighted: number;
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
  /** 用户手动加入“熟词僻义专项” */
  polyManual: number;
}

export interface AiCacheRow {
  key: string;
  word: string;
  task: string;
  model: string;
  text: string;
  updatedAt: number;
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
  /** DeepSeek（或兼容 OpenAI 协议的服务）配置 */
  aiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  /** AI 例句的个性化背景，例如“工科学生” */
  aiMajor: string;
  /** 学习范围（词单） */
  studyScope: StudyScope;
  /** custom = 自己定每日新词数；exam = 在考试前背完（自动倒推） */
  newPlanMode: NewPlanMode;
  /** 考前背完模式：提前多少天完成第一轮 */
  examBufferDays: number;
  /** 每背完多少个词弹一次阶段复习，0 = 关闭 */
  batchReview: number;
  /** 学新词时自动调用 AI 助记（需要自己填 Key） */
  autoAiMnemonic: boolean;
}
