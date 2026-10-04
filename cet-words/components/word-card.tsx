"use client";

import { Star, Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import { speak } from "@/lib/speech";
import { TIER_DESC, TIER_LABEL, TIER_STARS } from "@/lib/tiers";
import type { Word } from "@/lib/types";
import { Badge } from "./ui";

/** 高频等级：由词库分层（真题题型加权分位）决定 */
export function tierStars(tier: number): { stars: string; label: string; desc: string } {
  const key = [1, 2, 3, 4, 5, 6].includes(tier) ? tier : 6;
  return { stars: TIER_STARS[key], label: TIER_LABEL[key], desc: TIER_DESC[key] };
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-500">{title}</div>
      <div className="text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

export function WordCard({ word, reveal }: { word: Word; reveal: 0 | 1 | 2 }) {
  const freq = tierStars(word.tier ?? 6);
  const uk = word.uk ? `/${word.uk}/` : "";
  const us = word.us ? `/${word.us}/` : "";

  return (
    <div className="card fade-in p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h3 className="text-3xl font-semibold tracking-tight text-slate-900">{word.word}</h3>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {uk ? (
            <button
              type="button"
              onClick={() => speak(word.word, "uk")}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 hover:bg-slate-100"
              title="英音"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span className="font-mono">{uk}</span>
            </button>
          ) : null}
          {us && us !== uk ? (
            <button
              type="button"
              onClick={() => speak(word.word, "us")}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 hover:bg-slate-100"
              title="美音"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span className="font-mono">{us}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {word.levels.map((lv) => (
          <Badge key={lv} tone={lv === "CET4" ? "indigo" : "violet"}>
            {lv === "CET4" ? "CET-4" : "CET-6"}
          </Badge>
        ))}
        <span title={freq.desc}>
          <Badge tone={(word.tier ?? 6) <= 2 ? "amber" : (word.tier ?? 6) === 3 ? "sky" : "slate"}>
            <Star className="mr-1 h-3 w-3" />
            {freq.label}
            <span className="ml-1 tracking-tight">{freq.stars}</span>
          </Badge>
        </span>
        {word.exam.count > 0 ? (
          <Badge tone="emerald">
            真题 {word.exam.count} 次
            {word.weighted ? ` · 加权 ${word.weighted}` : ""}
          </Badge>
        ) : null}
        {word.poly ? <Badge tone="sky">熟词僻义</Badge> : null}
      </div>

      {reveal >= 1 ? (
        <div className="mt-5 space-y-3">
          <div className="space-y-2">
            {word.trans.map((t, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-1 w-9 shrink-0 text-right text-xs font-medium text-indigo-500">{t.pos}</span>
                <div>
                  <div className="text-base leading-relaxed text-slate-900">{t.cn}</div>
                  {t.en ? <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.en}</div> : null}
                </div>
              </div>
            ))}
          </div>

          {word.sentences.length > 0 ? (
            <div className="rounded-xl bg-slate-50 p-3.5">
              <div className="mb-1 text-xs font-medium text-slate-500">例句</div>
              {word.sentences.slice(0, 2).map((s, i) => (
                <div key={i} className={i ? "mt-2.5" : ""}>
                  <div className="text-sm text-slate-800">{s.en}</div>
                  {s.cn ? <div className="text-xs text-slate-500">{s.cn}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {reveal >= 2 ? (
        <div className="mt-5 space-y-4 border-t border-dashed border-slate-200 pt-4">
          {word.rem ? <Block title="记忆方法">{word.rem}</Block> : null}

          {word.roots.length > 0 ? (
            <Block title="词根词缀 / 派生词">
              <div className="space-y-1.5">
                {word.roots.map((g, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium text-indigo-500">{g.pos}</span>
                    {g.words.map((w) => (
                      <span key={w.hwd} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs">
                        <span className="font-medium text-slate-800">{w.hwd}</span>
                        <span className="text-slate-500"> {w.tran}</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </Block>
          ) : null}

          {word.phrases.length > 0 ? (
            <Block title="常见搭配">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {word.phrases.slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <span className="font-medium text-slate-800">{p.en}</span>
                    <span className="shrink-0 text-xs text-slate-500">{p.cn}</span>
                  </div>
                ))}
              </div>
            </Block>
          ) : null}

          {word.exam.sentences.length > 0 ? (
            <Block title="真题语境">
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {Object.entries(word.exam.byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <span key={type}>
                      {type} <span className="font-medium text-slate-700">{count}</span>
                    </span>
                  ))}
                {word.exam.years.length > 0 ? <span>出现年份 {word.exam.years.slice(0, 4).join(" / ")}</span> : null}
              </div>
              <div className="space-y-2">
                {word.exam.sentences.slice(0, 2).map((s, i) => (
                  <div key={i} className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="text-sm text-slate-800">{s.en}</div>
                    <div className="mt-1 text-[11px] text-emerald-700">
                      {[s.year, s.type].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </Block>
          ) : null}

          {word.syno.length > 0 ? (
            <Block title="同近义词">
              <div className="space-y-1">
                {word.syno.map((g, i) => (
                  <div key={i}>
                    <span className="text-xs text-indigo-500">{g.pos} </span>
                    <span className="text-slate-700">{g.ws.join(", ")}</span>
                    {g.tran ? <span className="text-xs text-slate-400"> · {g.tran}</span> : null}
                  </div>
                ))}
              </div>
            </Block>
          ) : null}

          {word.antos.length > 0 ? <Block title="反义词">{word.antos.join(", ")}</Block> : null}
        </div>
      ) : null}
    </div>
  );
}
