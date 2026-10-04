"use client";

import { db } from "./db";
import type { Settings, Word } from "./types";

export type AiTask = "mnemonic" | "example" | "explain";

export const AI_TASK_LABEL: Record<AiTask, string> = {
  mnemonic: "AI 助记",
  example: "AI 例句",
  explain: "AI 解释",
};

export function aiCacheKey(word: string, task: AiTask, model: string): string {
  return `${word.toLowerCase()}|${task}|${model}`;
}

export async function getCachedAi(word: string, task: AiTask, model: string): Promise<string | null> {
  const row = await db.ai.get(aiCacheKey(word, task, model));
  return row?.text ?? null;
}

export interface StreamResult {
  text?: string;
  error?: string;
}

/** 调用本地 /api/ai 代理，流式读取 DeepSeek 输出 */
export async function streamAi(opts: {
  settings: Settings;
  task: AiTask;
  word: Word;
  question?: string;
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const { settings, task, word } = opts;
  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-key": settings.aiKey || "",
        "x-ai-base": settings.aiBaseUrl || "",
      },
      body: JSON.stringify({
        task,
        word: word.word,
        senses: word.trans.slice(0, 4),
        examTypes: word.exam.byType,
        major: settings.aiMajor,
        question: opts.question,
        model: settings.aiModel,
        stream: true,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    return { error: `请求失败：${(err as Error).message}` };
  }

  if (!res.ok || !res.body) {
    let message = `请求失败（${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string };
      message = data.error || message;
    } catch {
      /* 忽略 */
    }
    return { error: message };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          opts.onDelta(delta);
        }
      } catch {
        /* 忽略非 JSON 心跳 */
      }
    }
  }
  return { text };
}

export async function saveAiCache(word: string, task: AiTask, model: string, text: string): Promise<void> {
  await db.ai.put({
    key: aiCacheKey(word, task, model),
    word: word.toLowerCase(),
    task,
    model,
    text,
    updatedAt: Date.now(),
  });
}

export async function dropAiCache(word: string, model: string): Promise<void> {
  const rows = await db.ai.where("word").equals(word.toLowerCase()).toArray();
  await db.ai.bulkDelete(rows.filter((r) => r.model === model).map((r) => r.key));
}

/** 测试 DeepSeek 连通性（非流式，短请求） */
export async function testAiConnection(
  settings: Settings,
): Promise<{ ok: boolean; message: string; reply?: string }> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-key": settings.aiKey || "",
        "x-ai-base": settings.aiBaseUrl || "",
      },
      body: JSON.stringify({ task: "test", model: settings.aiModel, stream: false }),
    });
    const data = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
    if (!res.ok || data.error) return { ok: false, message: data.error || `HTTP ${res.status}` };
    return { ok: true, message: `连接成功（${settings.aiModel}）`, reply: data.reply };
  } catch (err) {
    return { ok: false, message: `请求失败：${(err as Error).message}` };
  }
}

export interface AiExpression {
  en: string;
  cn: string;
  note: string;
}

/** 解析 AI 返回的「英文 || 中文 || 说明」表达列表 */
export function parseExpressions(text: string): AiExpression[] {
  const rows: AiExpression[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*\d+[.、)\]]\s*/, "")
      .replace(/^[-*•]\s*/, "")
      .trim();
    if (!line.includes("||")) continue;
    const parts = line.split("||").map((s) => s.trim());
    if (parts.length >= 2 && parts[0]) rows.push({ en: parts[0], cn: parts[1] ?? "", note: parts[2] ?? "" });
  }
  return rows;
}

/** 生成 / 提取表达：按主题让 AI 写，或从网页里提取 */
export async function generateExpressions(
  settings: Settings,
  opts: { kind: "writing" | "translation"; theme?: string; url?: string },
): Promise<{ rows: AiExpression[]; error?: string }> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-key": settings.aiKey || "",
        "x-ai-base": settings.aiBaseUrl || "",
      },
      body: JSON.stringify({
        task: opts.url ? "extract-url" : "expressions",
        kind: opts.kind,
        theme: opts.theme,
        url: opts.url,
        model: settings.aiModel,
        stream: false,
      }),
    });
    const data = (await res.json()) as { reply?: string; error?: string };
    if (!res.ok || data.error) return { rows: [], error: data.error || `HTTP ${res.status}` };
    return { rows: parseExpressions(data.reply || "") };
  } catch (err) {
    return { rows: [], error: `请求失败：${(err as Error).message}` };
  }
}

/** 极简 Markdown 渲染所需的分行处理（加粗、标题、列表） */
export function aiLines(text: string): { kind: "h" | "li" | "p" | "blank"; text: string }[] {
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return { kind: "blank" as const, text: "" };
    if (/^#{1,4}\s+/.test(t)) return { kind: "h" as const, text: t.replace(/^#{1,4}\s+/, "") };
    if (/^[-*•]\s+/.test(t)) return { kind: "li" as const, text: t.replace(/^[-*•]\s+/, "") };
    return { kind: "p" as const, text: t };
  });
}
