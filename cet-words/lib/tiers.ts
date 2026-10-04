/** 考试优先级分层（对应产品文档 §6 的单词权重阶梯） */
export const TIER_LABEL: Record<number, string> = {
  1: "高频真题词",
  2: "高频核心词",
  3: "熟词僻义",
  4: "真题词",
  5: "中频词",
  6: "低频词",
};

export const TIER_DESC: Record<number, string> = {
  1: "近十年真题出现次数最多的词",
  2: "真题高频出现，考试核心",
  3: "认识但容易考偏释义，需要专项突破",
  4: "真题出现过，值得掌握",
  5: "四六级大纲核心词",
  6: "大纲基础词，优先级最低",
};

export const TIER_STARS: Record<number, string> = {
  1: "★★★★★",
  2: "★★★★☆",
  3: "★★★☆☆",
  4: "★★☆☆☆",
  5: "★★☆☆☆",
  6: "★☆☆☆☆",
};

export function tierLabel(tier: number): string {
  return TIER_LABEL[tier] ?? "未分层";
}
