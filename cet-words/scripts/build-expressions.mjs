#!/usr/bin/env node
/**
 * 从四六级真题语料里提取写作 / 翻译表达库：
 *   - 写作高分句型：真题语料里反复出现、可直接套用的完整句子
 *   - 写作模板句式：常见高分句型模板（精选句式族 + 命中次数 + 例句）
 *   - 翻译常用表达：翻译（文本题）语料里的高频句式
 * 输出 public/data/expressions.json，应用离线读取，不联网、不调用 AI。
 *
 * 用法: node scripts/build-expressions.mjs
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.resolve(root, process.env.CET_SRC || "data-src");
const outFile = path.resolve(root, "public/data/expressions.json");

const FILES = ["cet4.raw.jsonl", "cet6.raw.jsonl"];

const clean = (s) => (s || "").replace(/^\.+|\.+$/g, "").replace(/\s+/g, " ").trim();
const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");

/** 写作常用高分句式模板（人工精选句式族，在语料里统计命中） */
const PATTERNS = [
  { key: "There is no denying that ...", cn: "不可否认……（开篇/论证）", re: /there is no (denying|doubt) that/i },
  { key: "It is universally acknowledged that ...", cn: "众所周知……（开篇）", re: /it is (universally |widely )?(acknowledged|believed|known) that/i },
  { key: "It is ... that ...", cn: "强调句：正是……", re: /\bit is\b[^.]{3,50}?\bthat\b/i },
  { key: "not only ... but also ...", cn: "不仅……而且……（并列递进）", re: /not only\b[^.]{3,70}?\bbut also\b/i },
  { key: "As far as ... is concerned", cn: "就……而言（引出观点）", re: /as far as\b[^.]{3,40}?\bis concerned/i },
  { key: "With the development of ...", cn: "随着……的发展（背景句）", re: /with the (rapid |fast )?(development|growth|advance|popularity) of/i },
  { key: "play an important role in ...", cn: "在……中起重要作用（论证）", re: /play(s|ed)? (an|a) (important|vital|crucial|significant|key) role in/i },
  { key: "contribute to ...", cn: "有助于 / 促成……（因果）", re: /contribut(e|es|ed|ing) to/i },
  { key: "make it possible ...", cn: "使……成为可能", re: /ma(de|kes|ke) it possible/i },
  { key: "attach importance to ...", cn: "重视……（建议）", re: /attach(es|ed)? (great |much |more )?importance to/i },
  { key: "take ... into account", cn: "把……考虑在内", re: /tak(e|es|ing|en)\b[^.]{3,40}?\binto (account|consideration)/i },
  { key: "The more ..., the more ...", cn: "越……越……（递进）", re: /the more\b[^.]{3,50}?\bthe more\b/i },
  { key: "in terms of ...", cn: "在……方面", re: /in terms of/i },
  { key: "be beneficial to ...", cn: "对……有益", re: /(is|are|was|were) beneficial to/i },
  { key: "have access to ...", cn: "能够获得 / 接触到……", re: /(have|has|had|having) access to/i },
  { key: "make a difference", cn: "产生影响 / 带来改变", re: /make(s|d)? a (big |huge |real |great )?difference/i },
  { key: "It is high time that ...", cn: "该是……的时候了（倡议）", re: /it is (high|about) time that/i },
  { key: "Only in this way can ...", cn: "只有这样才……（结尾）", re: /only in this way (can|will|could)/i },
];

function readSentences() {
  const rows = [];
  for (const file of FILES) {
    const full = path.join(srcDir, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/).filter(Boolean)) {
      let raw;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const head = clean(raw.headWord);
      for (const s of raw?.content?.word?.content?.realExamSentence?.sentences || []) {
        const type = s?.sourceInfo?.type;
        if (type !== "写作题" && type !== "文本题") continue;
        const en = clean(s.sContent);
        if (en.length < 25 || en.length > 200) continue;
        rows.push({ type, en, year: clean(s.sourceInfo?.year || ""), word: head });
      }
    }
  }
  return rows;
}

function build(rows, type) {
  const sentences = new Map();
  for (const row of rows) {
    if (row.type !== type) continue;
    const key = norm(row.en);
    const hit = sentences.get(key);
    if (hit) {
      hit.hits += 1;
      if (row.word && hit.words.length < 4 && !hit.words.includes(row.word)) hit.words.push(row.word);
    } else {
      sentences.set(key, { en: row.en, year: row.year, hits: 1, words: row.word ? [row.word] : [] });
    }
  }
  const list = [...sentences.values()].sort((a, b) => b.hits - a.hits || a.en.length - b.en.length);

  const patterns = [];
  for (const p of PATTERNS) {
    let count = 0;
    let example = "";
    let year = "";
    for (const s of list) {
      if (!p.re.test(s.en)) continue;
      count += 1;
      if (!example) {
        example = s.en;
        year = s.year;
      }
    }
    if (count > 0) patterns.push({ key: p.key, cn: p.cn, count, example, year });
  }
  patterns.sort((a, b) => b.count - a.count);
  return { sentences: list, patterns };
}

const rows = readSentences();
const writing = build(rows, "写作题");
const translation = build(rows, "文本题");

const output = {
  generatedAt: new Date().toISOString(),
  source: "KyleBing/english-vocabulary 四六级真题例句语料",
  writing: { sentences: writing.sentences.slice(0, 220), patterns: writing.patterns },
  translation: { sentences: translation.sentences.slice(0, 160), patterns: translation.patterns },
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(output));

console.log("原始句:", rows.length);
console.log("写作：唯一高分句", writing.sentences.length, "（输出", output.writing.sentences.length, "）命中句式模板", writing.patterns.length);
console.log("翻译：唯一句", translation.sentences.length, "（输出", output.translation.sentences.length, "）命中句式模板", translation.patterns.length);
console.log("Top 写作句型:", writing.sentences.slice(0, 3).map((s) => `${s.hits}x ${s.en.slice(0, 60)}`).join(" | "));
console.log("Top 模板:", writing.patterns.slice(0, 4).map((p) => `${p.count}x ${p.key}`).join(" | "));
console.log("输出:", outFile, (fs.statSync(outFile).size / 1024).toFixed(1) + " KB");
