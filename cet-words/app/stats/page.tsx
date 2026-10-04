"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Flame } from "lucide-react";
import { useState } from "react";
import { ActivityCalendar, BarChart, Ring, StackedBars } from "@/components/charts";
import { Card, ProgressBar, StatCard } from "@/components/ui";
import { formatCnDate, formatDuration, weekdayCn } from "@/lib/date";
import { useSettings } from "@/lib/hooks";
import {
  computeStreak,
  curveData,
  futureLoad,
  getDay,
  lifetimeTotals,
  recentDays,
  retentionRate,
  statusCounts,
  polyStats,
} from "@/lib/stats";

export default function StatsPage() {
  const { settings } = useSettings();
  const [range, setRange] = useState<"7" | "30" | "all">("7");

  const today = useLiveQuery(() => getDay(), [], undefined);
  const days = useLiveQuery(() => recentDays(60), [], []);
  const totals = useLiveQuery(() => lifetimeTotals(), [], undefined);
  const counts = useLiveQuery(() => (settings ? statusCounts(settings) : null), [settings]);
  const load = useLiveQuery(() => futureLoad(7), [], []);
  const retention = useLiveQuery(() => retentionRate(), [], 0);
  const curve = useLiveQuery(() => curveData(range), [range], []);
  const poly = useLiveQuery(() => (settings ? polyStats(settings) : null), [settings]);

  const streak = computeStreak(days ?? []);
  const week = (days ?? []).slice(-7);
  const weekNew = week.reduce((a, d) => a + d.newWords, 0);
  const weekReviews = week.reduce((a, d) => a + d.reviews, 0);

  const totalWords = counts
    ? counts.new + counts.learning + counts.short + counts.long + counts.mastered + counts.lapsed
    : 0;
  const mastered = (counts?.mastered ?? 0) + (counts?.long ?? 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">学习数据</h1>
        <p className="text-sm text-slate-500">掌握情况、记忆保持率与未来复习量</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="今日学习"
          value={(today?.newWords ?? 0) + (today?.reviews ?? 0)}
          sub={`新词 ${today?.newWords ?? 0} · 复习 ${today?.reviews ?? 0}`}
          tone="indigo"
        />
        <StatCard label="本周学习" value={weekNew + weekReviews} sub={`新词 ${weekNew} · 复习 ${weekReviews}`} tone="sky" />
        <StatCard
          label="总学习时间"
          value={formatDuration(totals?.durationMs ?? 0)}
          sub={`累计复习 ${totals?.reviews ?? 0} 次`}
          tone="emerald"
        />
        <StatCard
          label="连续学习"
          value={`${streak} 天`}
          sub={`累计学习 ${totals?.activeDays ?? 0} 天`}
          tone="amber"
          icon={<Flame className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold text-slate-900">掌握情况</h2>
          <div className="mt-4 flex items-center gap-6">
            <div className="flex-1 space-y-3 text-sm">
              {[
                { label: "已掌握", value: counts?.mastered ?? 0, tone: "emerald" as const },
                { label: "长期记忆", value: counts?.long ?? 0, tone: "violet" as const },
                { label: "短期记忆", value: counts?.short ?? 0, tone: "sky" as const },
                { label: "学习中", value: (counts?.learning ?? 0) + (counts?.lapsed ?? 0), tone: "indigo" as const },
                { label: "未学习", value: counts?.new ?? 0, tone: "slate" as const },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-slate-600">
                    <span>{row.label}</span>
                    <span className="tabular-nums">{row.value}</span>
                  </div>
                  <ProgressBar value={row.value} max={Math.max(1, totalWords)} tone={row.tone} />
                </div>
              ))}
            </div>
            <div className="hidden text-center sm:block">
              <Ring
                value={totalWords ? mastered / totalWords : 0}
                label="长期掌握"
                sub={`${mastered} / ${totalWords}`}
              />
            </div>
          </div>
          {poly && poly.total > 0 ? (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-sky-50 px-3.5 py-2.5 text-xs text-sky-900">
              <span>
                熟词僻义掌握率
                <span className="ml-1 text-sky-600">（认识但不知道考义的高危词）</span>
              </span>
              <span className="font-semibold tabular-nums">
                {Math.round((poly.mastered / poly.total) * 100)}%
                <span className="ml-1 font-normal text-sky-600">
                  {poly.mastered} / {poly.total}
                </span>
              </span>
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col items-center justify-center gap-3">
          <h2 className="self-start text-base font-semibold text-slate-900">预计记忆保持率</h2>
          <Ring value={retention ?? 0} label="当前记忆" sub="基于 FSRS 记忆强度" />
          <p className="text-center text-xs text-slate-500">
            保持率表示已学单词在今天的预计回忆概率；FSRS 会把它维持在 90% 附近。
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">学习曲线</h2>
          <div className="flex gap-1">
            {(["7", "30", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  range === r ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r === "all" ? "全部" : `${r} 天`}
              </button>
            ))}
          </div>
        </div>
        {curve && curve.length ? (
          <StackedBars data={curve} />
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">还没有学习记录，去学第一组单词吧。</p>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">未来 7 天复习量</h2>
        <p className="mb-3 text-xs text-slate-500">FSRS 预测的每日到期卡片数量</p>
        <BarChart
          data={(load ?? []).map((p) => ({ label: weekdayCn(p.date), value: p.count, hint: formatCnDate(p.date) }))}
          tone="sky"
        />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">学习日历</h2>
        <p className="mb-3 text-xs text-slate-500">最近 5 周的打卡情况（颜色越深，当天完成的新词 + 复习越多）</p>
        <ActivityCalendar days={(days ?? []).slice(-35)} />
      </Card>
    </div>
  );
}
