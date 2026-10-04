"use client";

import Link from "next/link";
import { ArrowRight, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/date";
import { Rating } from "@/lib/fsrs";
import { useSettings } from "@/lib/hooks";
import {
  QUEUE_MODE_LABEL,
  buildLearnQueue,
  buildReviewQueue,
  buildTodayPlan,
  recordRating,
  type QueueCard,
  type SprintMixRow,
  type TodayPlan,
} from "@/lib/scheduler";
import { AiPanel } from "./ai-panel";
import { Badge, EmptyState, ProgressBar, btn } from "./ui";
import { WordCard } from "./word-card";

/** 三个按钮直接决定 FSRS 的复习频率：认识 = Good，模糊 = Hard，不认识 = Again */
const RECALL = [
  {
    key: "known",
    label: "认识",
    hint: "能说出意思",
    rating: Rating.Good as number,
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  },
  {
    key: "vague",
    label: "模糊",
    hint: "有点印象",
    rating: Rating.Hard as number,
    cls: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  },
  {
    key: "unknown",
    label: "不认识",
    hint: "完全没印象",
    rating: Rating.Again as number,
    cls: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  },
] as const;

interface SessionState {
  done: number;
  learned: number;
  reviewed: number;
  repeats: number;
  startedAt: number;
}

const EMPTY_SESSION: SessionState = { done: 0, learned: 0, reviewed: 0, repeats: 0, startedAt: Date.now() };

export function StudySession({ mode }: { mode: "learn" | "review" }) {
  const { settings } = useSettings();
  const [round, setRound] = useState(0);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [mix, setMix] = useState<SprintMixRow[]>([]);
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"recall" | "detail">("recall");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const [batch, setBatch] = useState<QueueCard[] | null>(null);
  const [repeatCount, setRepeatCount] = useState<Record<string, number>>({});
  const batchRef = useRef<QueueCard[]>([]);
  const cardStart = useRef(Date.now());

  useEffect(() => {
    if (!settings) return;
    let alive = true;
    (async () => {
      const nextPlan = await buildTodayPlan(settings);
      let nextQueue: QueueCard[] = [];
      let nextMix: SprintMixRow[] = [];
      if (mode === "learn") {
        nextQueue = await buildLearnQueue(settings, nextPlan.newTarget);
      } else {
        const review = await buildReviewQueue(settings);
        nextQueue = review.cards;
        nextMix = review.mix;
      }
      if (!alive) return;
      setPlan(nextPlan);
      setQueue(nextQueue);
      setMix(nextMix);
      setIndex(0);
      setPhase("recall");
      setSession({ ...EMPTY_SESSION, startedAt: Date.now() });
      setRepeatCount({});
      setBatch(null);
      batchRef.current = [];
      cardStart.current = Date.now();
    })();
    return () => {
      alive = false;
    };
  }, [settings, mode, round]);

  const current: QueueCard | undefined = queue?.[index];

  /** 回答“认识 / 模糊 / 不认识”：写入 FSRS，不认识或模糊的词今天继续出现 */
  const answer = useCallback(
    async (rating: number) => {
      if (!current || busy) return;
      setBusy(true);
      const durationMs = Date.now() - cardStart.current;
      await recordRating({
        word: current.word,
        rating,
        mode: current.isNew ? "learn" : "review",
        durationMs,
      });
      const known = rating >= Rating.Good;
      const wordKey = current.word.word.toLowerCase();
      if (!known) {
        setRepeatCount((prev) => ({ ...prev, [wordKey]: (prev[wordKey] ?? 0) + 1 }));
        setQueue((prev) => {
          if (!prev) return prev;
          const copy = [...prev];
          copy.splice(Math.min(index + 3, copy.length), 0, { ...current });
          return copy;
        });
      }
      setSession((s) => ({
        done: s.done + 1,
        learned: s.learned + (current.isNew ? 1 : 0),
        reviewed: s.reviewed + (current.isNew ? 0 : 1),
        repeats: s.repeats + (known ? 0 : 1),
        startedAt: s.startedAt,
      }));
      setPhase("detail");
      setBusy(false);
    },
    [busy, current, index],
  );

  /** 看完详细内容，直接下一个单词；每满 N 个词弹一次阶段复习 */
  const goNext = useCallback(() => {
    if (!current) return;
    const size = settings?.batchReview ?? 0;
    batchRef.current = [...batchRef.current, current];
    setIndex((i) => i + 1);
    setPhase("recall");
    cardStart.current = Date.now();
    if (size > 0 && batchRef.current.length >= size) {
      setBatch(batchRef.current);
      batchRef.current = [];
    }
  }, [current, settings?.batchReview]);

  const requeue = useCallback(
    (card: QueueCard, distance = 2) => {
      setQueue((prev) => {
        if (!prev) return prev;
        const copy = [...prev];
        copy.splice(Math.min(index + distance, copy.length), 0, { ...card });
        return copy;
      });
      setRepeatCount((prev) => ({ ...prev, [card.word.word.toLowerCase()]: (prev[card.word.word.toLowerCase()] ?? 0) + 1 }));
      setSession((s) => ({ ...s, repeats: s.repeats + 1 }));
    },
    [index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || busy || batch) return;
      if (phase === "recall") {
        const hit = ["1", "2", "3"].indexOf(e.key);
        if (hit >= 0) {
          answer(RECALL[hit].rating);
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          answer(Rating.Hard);
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, batch, busy, current, goNext, phase]);

  if (!plan) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在准备今日任务…
      </div>
    );
  }

  if (!queue || queue.length === 0) {
    return mode === "learn" ? (
      <EmptyState
        title={plan.remaining === 0 ? "🎉 这个词单已经全部学完" : "今天的新词已学完"}
        desc={
          plan.remaining === 0
            ? "可以在设置里换一个词单（比如「考前急救」「熟词僻义专项」）继续，或者去复习巩固。"
            : "去复习巩固已学单词，明天继续。"
        }
        action={
          <Link href="/review" className={btn.primary}>
            去复习
          </Link>
        }
      />
    ) : (
      <EmptyState
        title="还没有可复习的单词"
        desc="先去学几个新词，之后每天都会有复习。"
        action={
          <Link href="/learn" className={btn.primary}>
            学今日新词
          </Link>
        }
      />
    );
  }

  if (index >= queue.length) {
    return (
      <div className="card fade-in p-8 text-center">
        <div className="text-2xl">🎉</div>
        <div className="mt-1 text-lg font-semibold text-slate-900">本组完成</div>
        <p className="mt-1 text-sm text-slate-500">
          新学 {session.learned} · 复习 {session.reviewed}
          {session.repeats > 0 ? ` · 重复巩固 ${session.repeats} 次` : ""} · 用时 {formatDuration(Date.now() - session.startedAt)}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className={btn.primary}>
            返回今日
          </Link>
          <button
            className={btn.ghost}
            onClick={() => {
              setRound((r) => r + 1);
            }}
          >
            再来一组
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const wordKey = current.word.word.toLowerCase();
  const repeated = repeatCount[wordKey] ?? 0;

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={mode === "learn" ? "indigo" : "sky"}>{QUEUE_MODE_LABEL[current.mode]}</Badge>
          {current.word.poly ? <Badge tone="sky">熟词僻义</Badge> : null}
          {plan.sprint ? <Badge tone="rose">冲刺模式</Badge> : null}
          {mode === "learn" ? <Badge tone="violet">{plan.scopeName}</Badge> : null}
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
          {plan.counts.extra > 0 ? <span className="text-indigo-600">巩固复习 {plan.counts.extra}</span> : null}
          <span>遗忘词 {plan.counts.lapsed}</span>
          <span>顽固词 {plan.counts.stubborn}</span>
          <span>熟词僻义 {plan.counts.poly}</span>
          <span>真题高频 {plan.counts.exam}</span>
        </div>
      ) : null}

      {mode === "review" && mix.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          <span className="font-medium">冲刺配额</span>
          {mix.map((m) => (
            <span key={m.label} className="tabular-nums">
              {m.label} {m.actual}/{m.target}
            </span>
          ))}
        </div>
      ) : null}

      <WordCard word={current.word} reveal={phase === "recall" ? 0 : 2} />

      {phase === "recall" ? (
        <div className="space-y-2">
          <p className="text-center text-sm text-slate-500">
            先别看答案，你认识这个单词吗？
            {repeated > 0 ? <span className="ml-1 text-indigo-600">（第 {repeated + 1} 次出现，认识后今天不再出现）</span> : null}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {RECALL.map((r, i) => (
              <button
                key={r.key}
                disabled={busy}
                onClick={() => answer(r.rating)}
                className={`flex flex-col items-center gap-0.5 rounded-2xl border p-4 transition disabled:opacity-60 ${r.cls}`}
              >
                <span className="text-base font-semibold">{r.label}</span>
                <span className="text-[11px] opacity-70">
                  {r.hint} · {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AiPanel word={current.word} autoRun={Boolean(settings?.autoAiMnemonic && current.isNew)} />
          <button className={`${btn.primary} w-full py-3 text-base`} onClick={goNext}>
            下一个单词
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-[11px] text-slate-400">按空格 / 回车也可以继续</p>
        </div>
      )}

      {batch ? (
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-2xl space-y-3 p-5" style={{ marginTop: 24 }}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <h3 className="text-base font-semibold text-slate-900">阶段复习 · 刚才这 {batch.length} 个词</h3>
            </div>
            <p className="text-xs text-slate-500">
              一起过一遍再往下学。想不起来的点「再背一次」，它会重新排进今天的队列。
            </p>
            <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
              {batch.map((card, i) => (
                <div key={`${card.word.id}-${i}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-semibold text-slate-900">{card.word.word}</span>
                      {card.word.uk ? <span className="font-mono text-[11px] text-slate-400">/{card.word.uk}/</span> : null}
                    </div>
                    <div className="truncate text-xs text-slate-600">
                      {card.word.trans[0]?.pos} {card.word.trans[0]?.cn}
                    </div>
                  </div>
                  <button
                    className={`${btn.ghost} shrink-0 py-1.5 text-xs`}
                    onClick={() => requeue(card, 1)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    再背一次
                  </button>
                </div>
              ))}
            </div>
            <button className={`${btn.primary} w-full`} onClick={() => setBatch(null)}>
              记住了，继续学
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
