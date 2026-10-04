"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, RotateCcw } from "lucide-react";
import { Card, btn } from "@/components/ui";
import { daysUntil, nextCetDate, todayKey } from "@/lib/date";
import { db } from "@/lib/db";
import { useSettings } from "@/lib/hooks";
import { resetAllProgress } from "@/lib/scheduler";
import type { Level } from "@/lib/types";

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const cet4Count = useLiveQuery(() => db.words.where("l4").equals(1).count(), [], 0);
  const cet6Count = useLiveQuery(() => db.words.where("l6").equals(1).count(), [], 0);

  if (!settings) {
    return <div className="card p-8 text-center text-sm text-slate-500">读取设置中…</div>;
  }

  const left = daysUntil(settings.examDate);
  const estimateMinutes = Math.round(settings.dailyNew * 0.7);

  async function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      progress: await db.progress.toArray(),
      logs: await db.logs.toArray(),
      days: await db.days.toArray(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cet-words-backup-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">设置</h1>
        <p className="text-sm text-slate-500">考试类型、考试日期与每日计划</p>
      </header>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">考试类型</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["CET4", "CET6"] as Level[]).map((lv) => (
            <button
              key={lv}
              onClick={() => update({ examType: lv })}
              className={`rounded-xl border p-4 text-left transition ${
                settings.examType === lv ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-semibold text-slate-900">{lv === "CET4" ? "英语四级 CET-4" : "英语六级 CET-6"}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {lv === "CET4" ? `${cet4Count} 词` : `${cet6Count} 词`} · 含真题词频与熟词僻义
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">考试日期</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={settings.examDate}
            onChange={(e) => update({ examDate: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <span className="text-sm text-slate-500">{left >= 0 ? `距离考试还有 ${left} 天` : "考试日期已过"}</span>
          <button className={`${btn.ghost} py-1.5 text-xs`} onClick={() => update({ examDate: nextCetDate() })}>
            使用下一次四六级笔试日期
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">默认按每年 6 月 / 12 月第二个周六的四六级笔试日期计算。</p>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">每日学习计划</h2>
        <div className="mt-4 space-y-5">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">每日计划新词数</span>
              <span className="font-semibold tabular-nums text-indigo-600">{settings.dailyNew} 个</span>
            </div>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={settings.dailyNew}
              onChange={(e) => update({ dailyNew: Number(e.target.value) })}
              className="mt-2 w-full accent-indigo-600"
            />
            <p className="mt-1 text-xs text-slate-400">
              按每个新词约 40 秒估算，当前目标约需 {estimateMinutes} 分钟（不含复习）。
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">每日学习时间</span>
              <span className="font-semibold tabular-nums text-indigo-600">{settings.dailyMinutes} 分钟</span>
            </div>
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={settings.dailyMinutes}
              onChange={(e) => update({ dailyMinutes: Number(e.target.value) })}
              className="mt-2 w-full accent-indigo-600"
            />
            <p className="mt-1 text-xs text-slate-400">系统会参考时间预算安排每日新词与复习量。</p>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5">
            <span>
              <span className="text-sm text-slate-800">周末加强模式</span>
              <span className="mt-0.5 block text-xs text-slate-500">周六日自动把新词目标提高到 1.5 倍</span>
            </span>
            <input
              type="checkbox"
              checked={settings.weekendBoost}
              onChange={(e) => update({ weekendBoost: e.target.checked })}
              className="h-5 w-5 accent-indigo-600"
            />
          </label>

          <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-500">
            距离考试 20 天以内会自动进入 <span className="font-medium text-rose-600">冲刺模式</span>
            ：减少低频新词，优先复习高频词、错词、遗忘词、真题词与熟词僻义。当前状态：
            <span className="font-medium text-rose-600">{left <= 20 && left >= 0 ? "已开启" : "未开启"}</span>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">数据管理</h2>
        <p className="mt-1 text-xs text-slate-500">所有学习数据都保存在本机浏览器（IndexedDB），不会上传到服务器。</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button className={btn.ghost} onClick={exportData}>
            <Download className="h-4 w-4" />
            导出学习数据
          </button>
          <button
            className={`${btn.ghost} text-rose-600`}
            onClick={async () => {
              if (window.confirm("确定要清空全部学习进度吗？此操作不可撤销。")) {
                await resetAllProgress();
              }
            }}
          >
            <RotateCcw className="h-4 w-4" />
            重置学习进度
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">关于 CET Words</h2>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
          <li>词库：KyleBing/english-vocabulary 四六级词表（含音标、释义、例句、短语、同义词与真题例句）。</li>
          <li>记忆算法：ts-fsrs（FSRS），四档反馈 Again / Hard / Good / Easy 动态排期。</li>
          <li>状态模型：未学习 → 学习中 → 短期记忆 → 长期记忆 → 已掌握；遗忘后自动回到高频复习。</li>
          <li>
            词库共 {cet4Count} 个四级词、{cet6Count} 个六级词，重复词自动合并为 CET-4 + CET-6 双标签。
          </li>
        </ul>
      </Card>
    </div>
  );
}
