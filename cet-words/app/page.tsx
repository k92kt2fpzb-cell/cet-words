"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, CalendarClock, Flame, RefreshCw, Settings as SettingsIcon, TriangleAlert } from "lucide-react";
import { Badge, Card, ProgressBar, StatCard, btn } from "@/components/ui";
import { formatCnDate, formatDuration, todayKey } from "@/lib/date";
import { useSettings } from "@/lib/hooks";
import { buildTodayPlan } from "@/lib/scheduler";
import { computeStreak, recentDays } from "@/lib/stats";

export default function TodayPage() {
  const { settings } = useSettings();
  const plan = useLiveQuery(() => (settings ? buildTodayPlan(settings) : null), [settings]);
  const days = useLiveQuery(() => recentDays(60), [], []);
  const streak = computeStreak(days ?? []);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  const examLabel = settings?.examType === "CET6" ? "CET-6" : "CET-4";

  if (!plan) {
    return <div className="card p-8 text-center text-sm text-slate-500">正在读取学习计划…</div>;
  }

  const startHref = plan.counts.due > 0 ? "/review" : "/learn";
  const remainingDaysAfterFirstRound = plan.reviewBufferDays;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {greeting} 👋
          </h1>
          <p className="text-sm text-slate-500">
            {formatCnDate(todayKey())} · 先清复习债务，再学新词
          </p>
        </div>
        <Link href="/settings" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <SettingsIcon className="h-5 w-5" />
        </Link>
      </header>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-sm">
        {plan.daysLeft >= 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-sm opacity-80">距离 {examLabel} 考试还有</span>
              <span className="text-3xl font-semibold tabular-nums">{plan.daysLeft}</span>
              <span className="text-sm opacity-80">天</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-90">
              <span>考试日期 {formatCnDate(settings?.examDate ?? todayKey())}</span>
              {plan.remaining > 0 ? (
                <span>
                  第一轮预计 {formatCnDate(plan.firstRoundDate)} 完成
                  {remainingDaysAfterFirstRound > 0 ? ` · 留出 ${remainingDaysAfterFirstRound} 天强化复习` : ""}
                </span>
              ) : (
                <span>词库已全部学完，进入复习巩固阶段</span>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4" />
            考试日期已过，去
            <Link href="/settings" className="underline">
              设置
            </Link>
            更新下一次考试时间
          </div>
        )}
        {plan.sprint ? (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-2.5 py-1 text-xs">
            🚀 冲刺模式已开启：减少低频新词，主攻高频词 / 错词 / 遗忘词 / 真题词 / 熟词僻义
          </div>
        ) : null}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">今日任务</h2>
          <span className="text-xs text-slate-500">Review First</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/review" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40">
            <RefreshCw className="h-5 w-5 text-sky-500" />
            <div>
              <div className="text-xs text-slate-500">待复习</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{plan.counts.due}</div>
            </div>
          </Link>
          <Link href="/learn" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            <div>
              <div className="text-xs text-slate-500">今日新词</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{plan.newTarget}</div>
            </div>
          </Link>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <TriangleAlert className="h-5 w-5 text-amber-500" />
            <div>
              <div className="text-xs text-slate-500">顽固词</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{plan.counts.stubborn}</div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-600">今日进度</span>
            <span className="tabular-nums text-slate-900">
              <span className="font-semibold">{plan.todayDone}</span>
              <span className="text-slate-400"> / {plan.todayTotal}</span>
            </span>
          </div>
          <ProgressBar value={plan.todayDone} max={Math.max(1, plan.todayTotal)} />
          <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-500">
            <span>新词 {plan.todayNew}</span>
            <span>复习 {plan.todayReviews}</span>
            <span>学习时长 {formatDuration(plan.todayDurationMs)}</span>
          </div>
        </div>

        <Link href={startHref} className={`${btn.primary} mt-5 w-full py-3 text-base`}>
          {plan.todayTotal === 0 ? "今日任务已完成 🎉" : plan.counts.due > 0 ? "开始今日复习" : "开始今日学习"}
        </Link>
      </Card>

      {plan.lagging > 0 ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm text-amber-900">
              <div className="font-medium">当前落后 {plan.lagging} 个单词</div>
              <p className="mt-0.5 text-xs text-amber-700">
                建议未来 7 天每天增加 {Math.ceil(plan.lagging / 7)} 个新词
                {plan.catchUp > 0 ? `（今日目标已自动提高 ${plan.catchUp} 个）` : ""}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="连续学习"
          value={`🔥 ${streak} 天`}
          tone="amber"
          icon={<Flame className="h-4 w-4" />}
          sub={streak > 0 ? "保持住" : "今天开始第一天"}
        />
        <StatCard label="已掌握" value={plan.mastered} tone="emerald" sub="稳定记忆 ≥ 3 个月" />
        <StatCard label="学习中" value={plan.learning} tone="indigo" sub="含短期/长期记忆" />
        <StatCard label="未学习" value={plan.remaining} tone="slate" sub={`${examLabel} 词库共 ${plan.totalInLevel} 词`} />
      </div>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">学习计划</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">剩余未学</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{plan.remaining}</div>
            <div className="text-[11px] text-slate-400">共 {plan.totalInLevel} 词</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">建议每日学习量</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{plan.suggestedDaily}</div>
            <div className="text-[11px] text-slate-400">按考试日期倒推（留 {plan.reviewBufferDays || 16} 天强化）</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">当前每日目标</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {plan.newTarget}
              {plan.catchUp > 0 ? <span className="ml-1 text-xs text-amber-600">含追赶 +{plan.catchUp}</span> : null}
            </div>
            <div className="text-[11px] text-slate-400">基础 {plan.baseTarget} 个 / 天</div>
          </div>
        </div>
      </Card>

      <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs leading-relaxed text-slate-500">
        <Badge tone="indigo">四六级专属</Badge>
        <p className="mt-2">
          新词按考试权重排序（真题出现次数 → 词库顺序 → 熟词僻义），复习由 FSRS 算法动态排期：记得越牢的单词出现越少，越容易忘的单词出现越频繁。
        </p>
      </div>
    </div>
  );
}
