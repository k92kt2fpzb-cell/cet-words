"use client";

import Link from "next/link";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/date";
import { GRADES, Rating, previewIntervals } from "@/lib/fsrs";
import { useAsync } from "@/lib/hooks";
import {
  QUEUE_MODE_LABEL,
  buildLearnQueue,
  buildReviewQueue,
  buildTodayPlan,
  recordRating,
  type QueueCard,
  type TodayPlan,
} from "@/lib/scheduler";
import type { Progress } from "@/lib/types";
import { useSettings } from "@/lib/hooks";
import { Badge, EmptyState, ProgressBar, btn } from "./ui";
import { WordCard } from "./word-card";

const RECALL = [
  { key: "known", label: "认识", hint: "能说出意思", suggest: Rating.Good as number },
  { key: "vague", label: "模糊", hint: "有点印象", suggest: Rating.Hard as number },
  { key: "unknown", label: "不认识", hint: "完全没印象", suggest: Rating.Again as number },
] as const;

const GRADE_STYLE: Record<number, string> = {
  [Rating.Again]: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  [Rating.Hard]: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  [Rating.Good]: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  [Rating.Easy]: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
};

export function StudySession({ mode }: { mode: "learn" | "review" }) {
  const { settings } = useSettings();
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState(0);
  const [recall, setRecall] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState({ done: 0, again: 0, startedAt: Date.now() });
  const [live, setLive] = useState<Progress | undefined>(undefined);
  const cardStartRef = useRef(Date.now());
  const requeueRef = useRef<Map<string, number>>(new Map());

  const { data: loaded, loading } = useAsync(async () => {
    if (!settings) return null;
    const plan = await buildTodayPlan(settings);
    const queue = mode === "learn" ? await buildLearnQueue(settings, plan.newTarget) : await buildReviewQueue(settings);
    return { plan, queue };
  }, [settings, mode, round]);

  const plan: TodayPlan | null = loaded?.plan ?? null;
  const queue: QueueCard[] = loaded?.queue ?? [];
  const current = queue[index];

  useEffect(() => {
    if (index === 0) {
      setSession({ done: 0, again: 0, startedAt: Date.now() });
      cardStartRef.current = Date.now();
    }
  }, [index, round]);

  useEffect(() => {
    let alive = true;
    if (!current) {
      setLive(undefined);
      return;
    }
    db.progress.get(current.word.word.toLowerCase()).then((p) => {
      if (alive) setLive(p);
    });
    return () => {
      alive = false;
    };
  }, [current]);

  const finishCard = useCallback(
    async (rating: number) => {
      if (!current || busy) return;
      setBusy(true);
      const durationMs = Date.now() - cardStartRef.current;
      const result = await recordRating({
        word: current.word,
        rating,
        mode: current.isNew ? "learn" : "review",
        durationMs,
      });
      const times = requeueRef.current.get(current.word.word) ?? 0;
      if (result.requeue && times < 2) {
        requeueRef.current.set(current.word.word, times + 1);
        const insertAt = Math.min(index + 3, queue.length);
        const copy = [...queue];
        copy.splice(insertAt, 0, current);
        loaded!.queue = copy;
      }
      setSession((s) => ({
        done: s.done + 1,
        again: s.again + (rating === Rating.Again ? 1 : 0),
        startedAt: s.startedAt,
      }));
      setIndex((i) => i + 1);
      setStage(0);
      setRecall(null);
      cardStartRef.current = Date.now();
      setBusy(false);
    },
    [busy, current, index, loaded, queue],
  );

  const next = useCallback(() => setStage((s) => Math.min(3, s + 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || busy) return;
      if (stage === 0) {
        const hit = ["1", "2", "3"].indexOf(e.key);
        if (hit >= 0) {
          setRecall(RECALL[hit].key);
          next();
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          next();
        }
      } else if (stage < 3) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          next();
        }
      } else {
        const hit = ["1", "2", "3", "4"].indexOf(e.key);
        if (hit >= 0) finishCard(GRADES[hit].rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, current, finishCard, next, stage]);

  if (loading || !plan) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在准备今日任务…
      </div>
    );
  }

  if (!queue.length) {
    return mode === "learn" ? (
      <EmptyState
        title={plan.remaining === 0 ? "🎉 这个词库已经全部学完" : "今日新词已安排完毕"}
        desc={
          plan.sprint
            ? `已进入冲刺模式（距离考试 ${plan.daysLeft} 天），系统把重点放在高频词复习上，今日只安排 ${plan.newTarget} 个新词。`
            : "去复习巩固已学单词，明天再来学新词。"
        }
        action={
          <Link href="/review" className={btn.primary}>
            去复习
          </Link>
        }
      />
    ) : (
      <EmptyState
        title="今日没有到期复习 🎉"
        desc="所有已学单词都还没到复习时间，可以先学今天的新词。"
        action={
          <Link href="/learn" className={btn.primary}>
            学今日新词
          </Link>
        }
      />
    );
  }

  if (index >= queue.length) {
    const elapsed = Date.now() - session.startedAt;
    return (
      <div className="card fade-in p-8 text-center">
        <div className="text-2xl">🎉</div>
        <div className="mt-1 text-lg font-semibold text-slate-900">本组完成</div>
        <p className="mt-1 text-sm text-slate-500">
          共 {session.done} 张 · 忘记 {session.again} 个 · 用时 {formatDuration(elapsed)}
        </p>
        {session.again > 0 ? (
          <p className="mt-2 text-xs text-amber-600">忘记的单词已交给 FSRS 重新排期，稍后会再次出现。</p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className={btn.primary}>
            返回今日
          </Link>
          <button className={btn.ghost} onClick={() => { setIndex(0); setRound((r) => r + 1); }}>
            再来一组
          </button>
        </div>
      </div>
    );
  }

  const previews = previewIntervals(live);
  const suggested = recall ? RECALL.find((r) => r.key === recall)?.suggest : undefined;

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={mode === "learn" ? "indigo" : "sky"}>{QUEUE_MODE_LABEL[current.mode]}</Badge>
          {current.word.poly ? <Badge tone="sky">熟词僻义</Badge> : null}
          {plan.sprint ? <Badge tone="rose">冲刺模式</Badge> : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="tabular-nums">
            {index + 1} / {queue.length}
          </span>
          <Link href="/" className="rounded-lg px-2 py-1 hover:bg-slate-100">
            退出
          </Link>
        </div>
      </div>

      <ProgressBar value={index} max={queue.length} />

      {mode === "review" ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>到期复习 {plan.counts.due}</span>
          <span>遗忘词 {plan.counts.lapsed}</span>
          <span>顽固词 {plan.counts.stubborn}</span>
          <span>熟词僻义 {plan.counts.poly}</span>
          <span>真题高频 {plan.counts.exam}</span>
        </div>
      ) : null}

      <WordCard word={current.word} reveal={stage === 0 ? 0 : stage === 1 ? 1 : 2} />

      {stage === 0 ? (
        <div className="space-y-2">
          <p className="text-center text-sm text-slate-500">先别看答案，你认识这个单词吗？</p>
          <div className="grid grid-cols-3 gap-3">
            {RECALL.map((r, i) => (
              <button
                key={r.key}
                onClick={() => {
                  setRecall(r.key);
                  next();
                }}
                className="card flex flex-col items-center gap-0.5 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/40"
              >
                <span className="text-base font-semibold text-slate-800">{r.label}</span>
                <span className="text-[11px] text-slate-400">
                  {r.hint} · {i + 1}
                </span>
              </button>
            ))}
          </div>
          <button className="w-full py-1 text-center text-xs text-slate-400 hover:text-slate-600" onClick={next}>
            直接看答案（空格）
          </button>
        </div>
      ) : null}

      {stage === 1 ? (
        <button className={`${btn.primary} w-full`} onClick={next}>
          记忆辅助：词根 · 搭配 · 真题语境
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}

      {stage === 2 ? (
        <button className={`${btn.primary} w-full`} onClick={next}>
          开始评分
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}

      {stage === 3 ? (
        <div className="space-y-2">
          <p className="text-center text-xs text-slate-500">这次的记忆情况如何？（按 1-4 选择，带“建议”的是你的回忆结果对应档位）</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {GRADES.map((g) => {
              const preview = previews.find((p) => p.rating === g.rating);
              const isSuggested = suggested === g.rating;
              return (
                <button
                  key={g.rating}
                  disabled={busy}
                  onClick={() => finishCard(g.rating)}
                  className={`flex flex-col items-center gap-0.5 rounded-2xl border p-3.5 transition disabled:opacity-60 ${
                    GRADE_STYLE[g.rating]
                  } ${isSuggested ? "ring-2 ring-offset-1 ring-indigo-300" : ""}`}
                >
                  <span className="flex items-center gap-1 text-base font-semibold">
                    {isSuggested ? <Check className="h-3.5 w-3.5" /> : null}
                    {g.label}
                  </span>
                  <span className="text-[11px] opacity-70">{g.en}</span>
                  <span className="text-[11px] font-medium tabular-nums opacity-90">{preview?.text ?? ""}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
            <span>
              本次已完成 {session.done} 张 · 忘记 {session.again} 个
            </span>
            <button className="hover:text-slate-600" onClick={() => setIndex((i) => i + 1)}>
              跳过此词 <X className="inline h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
