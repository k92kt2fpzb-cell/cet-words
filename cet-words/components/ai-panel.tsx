"use client";

import Link from "next/link";
import { Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  aiLines,
  dropAiCache,
  getCachedAi,
  saveAiCache,
  streamAi,
  type AiTask,
} from "@/lib/ai";
import { useSettings } from "@/lib/hooks";
import { getSettings } from "@/lib/settings";
import type { Word } from "@/lib/types";
import { Badge, btn } from "./ui";

function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed text-slate-700">
      {aiLines(text).map((line, i) => {
        if (line.kind === "blank") return <div key={i} className="h-1" />;
        const parts = line.text
          .split(/(\*\*[^*]+\*\*)/g)
          .filter(Boolean)
          .map((seg, j) =>
            seg.startsWith("**") && seg.endsWith("**") ? (
              <strong key={j} className="font-semibold text-slate-900">
                {seg.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{seg}</span>
            ),
          );
        if (line.kind === "h")
          return (
            <div key={i} className="mt-2 text-sm font-semibold text-indigo-700">
              {parts}
            </div>
          );
        if (line.kind === "li")
          return (
            <div key={i} className="flex gap-2">
              <span className="text-indigo-400">•</span>
              <span className="flex-1">{parts}</span>
            </div>
          );
        return <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

export function AiPanel({
  word,
  defaultOpen = false,
  autoRun = false,
}: {
  word: Word;
  defaultOpen?: boolean;
  autoRun?: boolean;
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(defaultOpen);
  const [task, setTask] = useState<AiTask>("mnemonic");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [cached, setCached] = useState(false);
  const model = settings?.aiModel || "deepseek-chat";
  const hasKey = Boolean(settings?.aiKey);

  useEffect(() => {
    setText("");
    setError(null);
    setQuestion("");
    setCached(false);
  }, [word.id]);

  // 学新词时可选自动生成助记（需要用户自己配置 Key，默认关闭以免消耗额度）
  const autoRef = useState({ done: false })[0];
  useEffect(() => {
    if (!autoRun || autoRef.done || !settings?.aiKey) return;
    autoRef.done = true;
    run("mnemonic");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, settings?.aiKey, word.id]);

  async function run(next: AiTask, q?: string, force = false) {
    // 面板刚挂载时 settings 可能还在读库，这里兜底直接取一次，避免点击被静默吞掉
    const conf = settings ?? (await getSettings());
    if (!conf) return;
    setTask(next);
    setOpen(true);
    setError(null);
    if (!force) {
      const hit = await getCachedAi(word.word, next, model);
      if (hit) {
        setText(hit);
        setCached(true);
        return;
      }
    } else {
      await dropAiCache(word.word, model);
    }
    setCached(false);
    setText("");
    setLoading(true);
    const res = await streamAi({
      settings: conf,
      task: next,
      word,
      question: q,
      onDelta: (delta) => setText((prev) => prev + delta),
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.text) {
      setText(res.text);
      await saveAiCache(word.word, next, model, res.text);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <Sparkles className="h-4 w-4 text-violet-500" />
          AI 助手
        </span>
        <Badge tone="violet">{model}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className={`${btn.ghost} py-1.5 text-xs`} disabled={loading} onClick={() => run("mnemonic")}>
            AI 助记
          </button>
          <button className={`${btn.ghost} py-1.5 text-xs`} disabled={loading} onClick={() => run("example")}>
            AI 例句
          </button>
          {text && !loading ? (
            <button
              className={`${btn.subtle}`}
              onClick={() => run(task, question || undefined, true)}
              title="忽略缓存重新生成"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重新生成
            </button>
          ) : null}
        </div>
      </div>

      {settings && !hasKey ? (
        <p className="mt-2 text-xs text-amber-600">
          还没有配置 DeepSeek API Key，去
          <Link href="/settings" className="mx-1 underline">
            设置 → AI 助手
          </Link>
          填写后即可使用。
        </p>
      ) : null}

      {open || loading || error || text ? (
        <div className="mt-3 space-y-3">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>
          ) : null}

          {text ? (
            <div className="rounded-xl bg-slate-50 p-3">
              <RichText text={text} />
              {loading ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400 align-middle" /> : null}
              {cached ? <div className="mt-2 text-[11px] text-slate-400">来自本地缓存 · 可点“重新生成”</div> : null}
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在思考…
            </div>
          ) : null}

          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && question.trim()) run("explain", question.trim());
              }}
              placeholder={`关于 ${word.word} 提问，例如：为什么它有这个意思？`}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-300"
            />
            <button
              className={`${btn.primary} px-3 py-2 text-xs`}
              disabled={loading || !question.trim()}
              onClick={() => run("explain", question.trim())}
            >
              <Send className="h-3.5 w-3.5" />
              提问
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
