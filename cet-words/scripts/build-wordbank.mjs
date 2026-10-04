#!/usr/bin/env node
/**
 * 将 KyleBing/english-vocabulary 的四级 / 六级 JSONL 原始词库
 * 归一化为 CET Words 使用的紧凑词库 public/data/wordbank.json
 *
 * 用法:
 *   node scripts/build-wordbank.mjs             # 默认读取 data-src/
 *   CET_SRC=/path/to/dir node scripts/build-wordbank.mjs
 *
 * 原始数据来源: https://github.com/KyleBing/english-vocabulary
 * 文件: data-src/cet4.raw.jsonl, data-src/cet6.raw.jsonl
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.resolve(root, process.env.CET_SRC || "data-src");
const outFile = path.resolve(root, "public/data/wordbank.json");

const SOURCES = [
  { level: "CET4", file: "cet4.raw.jsonl" },
  { level: "CET6", file: "cet6.raw.jsonl" },
];

const stats = {
  lines: 0,
  words: 0,
  star: {},
  senses: {},
  exam: {},
  examTypes: {},
  multiPos: 0,
  withRem: 0,
  withSentences: 0,
};

/** @type {Map<string, any>} */
const byWord = new Map();

const clip = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

function parseSenses(c) {
  return clip(c.trans, 6)
    .map((t) => ({ pos: clean(t.pos) || "", cn: clean(t.tranCn), en: clean(t.tranOther) }))
    .filter((t) => t.cn || t.en);
}

function parseExamSentences(c) {
  const list = c?.realExamSentence?.sentences;
  if (!Array.isArray(list)) return { count: 0, byType: {}, years: [], sentences: [] };
  const byType = {};
  const years = new Set();
  const sentences = [];
  for (const s of list) {
    const info = s.sourceInfo || {};
    const type = clean(info.type) || "其他";
    byType[type] = (byType[type] || 0) + 1;
    if (info.year) years.add(clean(info.year));
    if (sentences.length < 3) {
      sentences.push({ en: clean(s.sContent), type, year: clean(info.year || "") });
    }
  }
  return {
    count: list.length,
    byType,
    years: [...years].sort().reverse().slice(0, 8),
    sentences,
  };
}

for (const { level, file } of SOURCES) {
  const full = path.join(srcDir, file);
  if (!fs.existsSync(full)) {
    console.warn(`[skip] 找不到 ${full}`);
    continue;
  }
  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/).filter((l) => l.trim());
  console.log(`${level}: ${lines.length} 行 <- ${file}`);
  stats.lines += lines.length;

  for (const line of lines) {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const head = clean(raw.headWord);
    if (!head) continue;
    const c = raw?.content?.word?.content || {};
    const senses = parseSenses(c);
    const sentences = clip(c?.sentence?.sentences, 3)
      .map((s) => ({ en: clean(s.sContent), cn: clean(s.sCn) }))
      .filter((s) => s.en);
    const phrases = clip(c?.phrase?.phrases, 8)
      .map((p) => ({ en: clean(p.pContent), cn: clean(p.pCn) }))
      .filter((p) => p.en);
    const syno = clip(c?.syno?.synos, 4)
      .map((s) => ({ pos: clean(s.pos), tran: clean(s.tran), ws: clip(s.hwds, 6).map((h) => clean(h.w)).filter(Boolean) }))
      .filter((s) => s.ws.length);
    const antos = clip(c?.antos?.anto, 6).map((a) => clean(a.hwd || a.w)).filter(Boolean);
    const roots = clip(c?.relWord?.rels, 3)
      .map((r) => ({
        pos: clean(r.pos),
        words: clip(r.words, 6).map((x) => ({ hwd: clean(x.hwd), tran: clean(x.tran) })).filter((x) => x.hwd),
      }))
      .filter((r) => r.words.length);
    const rem = clean(c?.remMethod?.val);
    const exam = parseExamSentences(c);
    const star = Number.isFinite(Number(c.star)) ? Number(c.star) : 0;
    const uk = clean(c.ukphone);
    const us = clean(c.usphone);
    const rank = Number.isFinite(Number(raw.wordRank)) ? Number(raw.wordRank) : 9999;

    stats.star[star] = (stats.star[star] || 0) + 1;
    const senseBucket = Math.min(senses.length, 4);
    stats.senses[senseBucket] = (stats.senses[senseBucket] || 0) + 1;
    const examBucket = exam.count === 0 ? 0 : Math.min(exam.count, 10);
    stats.exam[examBucket] = (stats.exam[examBucket] || 0) + 1;
    for (const t of Object.keys(exam.byType)) stats.examTypes[t] = (stats.examTypes[t] || 0) + 1;
    const posCount = new Set(senses.map((s) => s.pos).filter(Boolean)).size;
    if (senses.length >= 2 && posCount >= 2) stats.multiPos++;
    if (rem) stats.withRem++;
    if (sentences.length) stats.withSentences++;

    const existing = byWord.get(head.toLowerCase());
    if (existing) {
      if (!existing.levels.includes(level)) existing.levels.push(level);
      existing.rank = Math.min(existing.rank, rank);
      continue;
    }
    byWord.set(head.toLowerCase(), {
      word: head,
      uk,
      us,
      trans: senses,
      sentences,
      phrases,
      syno,
      antos,
      roots,
      rem,
      star,
      rank,
      levels: [level],
      exam,
    });
  }
}

// 考试权重排序：真题出现次数 + 星级 + 词库顺序
const words = [...byWord.values()].map((w, i) => {
  const senseCount = w.trans.length;
  const posCount = new Set(w.trans.map((t) => t.pos).filter(Boolean)).size;
  const poly = senseCount >= 2 && posCount >= 2;
  const priority = w.exam.count * 100 + w.star * 25 + (poly ? 8 : 0) + (w.levels.length > 1 ? 6 : 0) - w.rank / 1000;
  return { ...w, senseCount, posCount, poly, priority: Math.round(priority * 100) / 100, id: 0 };
}).sort((a, b) => b.priority - a.priority || a.word.localeCompare(b.word));

words.forEach((w, i) => {
  w.id = i + 1;
});

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), count: words.length, words }));

stats.words = words.length;
console.log("--- 统计 ---");
console.log("唯一单词:", stats.words, "/ 原始行:", stats.lines);
console.log("星级分布(star:count):", JSON.stringify(stats.star));
console.log("义项数分布(0..4):", JSON.stringify(stats.senses));
console.log("真题句数分布(0..10):", JSON.stringify(stats.exam));
console.log("真题题型:", JSON.stringify(stats.examTypes));
console.log("多词性多义项(熟词僻义候选):", stats.multiPos);
console.log("有记忆法 remMethod:", stats.withRem, " 有例句:", stats.withSentences);
console.log("输出:", outFile, (fs.statSync(outFile).size / 1024 / 1024).toFixed(2) + " MB");
