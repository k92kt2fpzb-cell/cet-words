"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Copy, Globe, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Card, btn } from "@/components/ui";
import { generateExpressions } from "@/lib/ai";
import { db } from "@/lib/db";
import { useAsync, useSettings } from "@/lib/hooks";

interface SentenceRow {
  en: string;
  year: string;
  hits: number;
  words: string[];
}

interface PatternRow {
  key: string;
  cn: string;
  count: number;
  example: string;
  year: string;
}

interface Pack {
  generatedAt: string;
  writing: { sentences: SentenceRow[]; patterns: PatternRow[] };
  translation: { sentences: SentenceRow[]; patterns: PatternRow[] };
}

type Kind = "writing" | "translation";

export default function ExpressionsPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<Kind>("writing");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"ai" | "web" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: pack, loading } = useAsync(async () => {
    const res = await fetch("/data/expressions.json", { cache: "force-cache" });
    return (await res.json()) as Pack;
  }, []);

  const saved = useLiveQuery(
    () => db.expr.orderBy("createdAt").reverse().limit(300).toArray(),
    [],
    [],
  );

  const hasKey = Boolean(settings?.aiKey);
  const section = pack?.[tab];
  const q = query.trim().toLowerCase();
  const sentences = (section?.sentences ?? []).filter((s) => !q || s.en.toLowerCase().includes(q));
  const savedOfKind = (saved ?? []).filter((r) => r.kind === tab && (!q || (r.en + r.cn).toLowerCase().includes(q)));

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setMessage(`已复制：${text.slice(0, 40)}`);
  };

  async function runGenerate(mode: "ai" | "web") {
    if (!settings) return;
    if (!hasKey) {
      setMessage("请先在「设置 → AI 助手」里填写你自己的 DeepSeek API Key");
      return;
    }
    setBusy(mode);
    setMessage(null);
    const res = await generateExpressions(settings, {
      kind: tab,
      theme: mode === "ai" ? theme.trim() : undefined,
      url: mode === "web" ? url.trim() : undefined,
    });
    setBusy(null);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    if (!res.rows.length) {
      setMessage("没有解析到表达，换个主题或网页再试一次");
      return;
    }
    const kind = tab;
    const source = mode === "ai" ? "ai" : "web";
    const label = mode === "ai" ? theme.trim() || "通用高分表达" : url.trim().slice(0, 60);
    await db.expr.bulkAdd(
      res.rows.map((r) => ({
        kind,
        source: source as "ai" | "web",
        theme: label,
        en: r.en,
        cn: r.cn,
        note: r.note,
        createdAt: Date.now(),
      })),
    );
    setMessage(`已加入 ${res.rows.length} 条表达`);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">写作 · 翻译表达库</h1>
        <p className="text-sm text-slate-500">
          真题语料里提取的高分句型与常用表达，也可以用 AI 按主题生成、或从网页文章里提取
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab("writing")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
            tab === "writing" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          写作 · {pack?.writing.sentences.length ?? 0} 条高分句
        </button>
        <button
          onClick={() => setTab("translation")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
            tab === "translation" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          翻译 · {pack?.translation.sentences.length ?? 0} 条常用句
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索表达，例如 important / 随着"
          className="ml-auto w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300 sm:w-64"
        />
      </div>

      {message ? <div className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">{message}</div> : null}

      {section?.patterns?.length ? (
        <Card>
          <h2 className="text-base font-semibold text-slate-900">高分句式模板</h2>
          <p className="mb-3 text-xs text-slate-500">真题语料里出现频率最高的可套用句型</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {section.patterns.map((p) => (
              <div key={p.key} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{p.key}</span>
                  <Badge tone="indigo">出现 {p.count} 句</Badge>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{p.cn}</div>
                {p.example ? (
                  <div className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                    {p.example.slice(0, 120)}
                    {p.year ? <span className="ml-1 text-slate-400">（{p.year}）</span> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {tab === "writing" ? "写作高分句型" : "翻译常用句式"}
          </h2>
          <span className="text-xs text-slate-500">共 {sentences.length} 条</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载真题语料…
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {sentences.map((s, i) => (
              <div key={`${s.en}-${i}`} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0">
                  <div className="text-sm leading-relaxed text-slate-800">{s.en}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    {s.year ? <span>真题 {s.year}</span> : null}
                    {s.hits > 1 ? <span>被 {s.hits} 个词汇条目引用</span> : null}
                    {s.words.slice(0, 3).map((w) => (
                      <span key={w} className="rounded bg-white px-1.5 py-0.5 text-slate-500">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
                <button className={`${btn.subtle} shrink-0`} onClick={() => copy(s.en)}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI 生成表达包
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            按主题生成{tahLabel(tab)}高频表达，加入下面的「我的表达」。
            {hasKey ? "" : "（需要先在设置里填你自己的 DeepSeek Key）"}
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="主题，例如：环保 / 人工智能 / 传统文化"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-300"
            />
            <button className={`${btn.primary} px-3 py-2 text-xs`} disabled={busy !== null} onClick={() => runGenerate("ai")}>
              {busy === "ai" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              生成
            </button>
          </div>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Globe className="h-4 w-4 text-sky-500" />
            从网页提取
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            贴一个英语学习 / 范文文章的网址，服务端抓取正文后由 AI 提炼成 15 条表达。
            {hasKey ? "" : "（需要先在设置里填你自己的 DeepSeek Key）"}
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-300"
            />
            <button className={`${btn.ghost} px-3 py-2 text-xs`} disabled={busy !== null || !url.trim()} onClick={() => runGenerate("web")}>
              {busy === "web" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              提取
            </button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">我的表达</h2>
          <span className="text-xs text-slate-500">AI 生成与网页提取的表达（保存在本机）</span>
        </div>
        {savedOfKind.length === 0 ? (
          <p className="text-xs text-slate-500">这里还是空的，用上面的 AI 生成或网页提取添加吧。</p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {savedOfKind.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{r.en}</div>
                  <div className="text-xs text-slate-600">{r.cn}</div>
                  {r.note ? <div className="mt-0.5 text-[11px] text-slate-400">{r.note}</div> : null}
                  <div className="mt-1 text-[11px] text-slate-400">
                    {r.source === "ai" ? "AI 生成" : "网页提取"} · {r.theme}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className={btn.subtle} onClick={() => copy(`${r.en} —— ${r.cn}`)}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button className={btn.subtle} onClick={() => r.id && db.expr.delete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs leading-relaxed text-slate-400">
        说明：高分句型与常用句式来自本机词库里的四六级真题例句语料（离线，不需要联网、不消耗 AI 额度）。
        AI 生成与网页提取需要你自己填 DeepSeek Key；网页提取受目标站点限制（需要登录或纯前端渲染的页面可能抓不到内容）。
        想直接背单词的话，回<Link href="/learn" className="mx-1 text-indigo-600 underline">学习</Link>页继续。
      </p>
    </div>
  );
}

function tahLabel(kind: Kind): string {
  return kind === "writing" ? "写作" : "翻译";
}
