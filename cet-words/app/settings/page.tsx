"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, RotateCcw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, btn } from "@/components/ui";
import { testAiConnection } from "@/lib/ai";
import { daysUntil, nextCetDate, todayKey } from "@/lib/date";
import { db } from "@/lib/db";
import { useSettings } from "@/lib/hooks";
import { buildTodayPlan, resetAllProgress } from "@/lib/scheduler";
import { SECONDS_PER_NEW_WORD, SECONDS_PER_REVIEW } from "@/lib/settings";
import type { DayStat, Level, Progress, ReviewLog, Settings } from "@/lib/types";
import { STUDY_SCOPES, scopeCounts } from "@/lib/wordbank";

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
        active ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const cet4Count = useLiveQuery(() => db.words.where("l4").equals(1).count(), [], 0);
  const cet6Count = useLiveQuery(() => db.words.where("l6").equals(1).count(), [], 0);
  const cet6Only = useLiveQuery(() => db.index.filter((r) => r.l6 === 1 && r.l4 === 0).count(), [], 0);
  const cet6Union = useLiveQuery(() => db.index.filter((r) => r.l6 === 1 || r.l4 === 1).count(), [], 0);
  const scopeInfo = useLiveQuery(
    () => (settings ? scopeCounts(settings.examType, settings.cet6IncludeBase) : null),
    [settings?.examType, settings?.cet6IncludeBase],
  );
  const plan = useLiveQuery(() => (settings ? buildTodayPlan(settings) : null), [settings]);
  const [keyDraft, setKeyDraft] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; reply?: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setKeyDraft(settings.aiKey ?? "");
  }, [settings?.aiKey]);

  if (!settings) {
    return <div className="card p-8 text-center text-sm text-slate-500">读取设置中…</div>;
  }

  const left = daysUntil(settings.examDate);
  const estimateMinutes = Math.round((settings.dailyNew * SECONDS_PER_NEW_WORD) / 60);
  const effectiveDaily = plan?.newTarget ?? 0;

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

  async function importData(file: File) {
    try {
      const payload = JSON.parse(await file.text()) as Record<string, unknown>;
      const rows = (value: unknown, key: string) =>
        Array.isArray(value) && value.every((row) => row && typeof row === "object" && typeof row[key] === "string");
      if (!payload || typeof payload !== "object" || !payload.settings ||
        typeof payload.settings !== "object" ||
        !["CET4", "CET6"].includes((payload.settings as Settings).examType) ||
        !rows(payload.progress, "word") || !rows(payload.logs, "word") || !rows(payload.days, "date")) {
        throw new Error("文件不是有效的 CET Words 学习数据备份");
      }
      if (!window.confirm("导入会覆盖此程序当前的学习进度和设置。确定继续吗？")) return;
      await db.transaction("rw", db.progress, db.logs, db.days, db.meta, async () => {
        await Promise.all([db.progress.clear(), db.logs.clear(), db.days.clear()]);
        await db.progress.bulkPut(payload.progress as Progress[]);
        await db.logs.bulkPut(payload.logs as ReviewLog[]);
        await db.days.bulkPut(payload.days as DayStat[]);
        await db.meta.put({ key: "settings", value: payload.settings });
      });
      window.location.reload();
    } catch (error) {
      window.alert(`导入失败：${(error as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">设置</h1>
        <p className="text-sm text-slate-500">词单、每日计划、AI 助手与数据管理</p>
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
                {lv === "CET4"
                  ? `${cet4Count} 词 · 含真题词频与熟词僻义`
                  : `六级新增 ${cet6Only} 词 · 考纲合计（含四级）${cet6Union} 词`}
              </div>
            </button>
          ))}
        </div>
        {settings.examType === "CET6" ? (
          <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 p-3.5">
            <span>
              <span className="text-sm text-slate-800">备考范围包含四级词汇</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                六级考试会用到四级词，默认包含（合计 {cet6Union} 词）；关掉后只学六级新增的 {cet6Only} 个词，
                适合四级刚考完、想在短期内冲六级的同学。
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.cet6IncludeBase}
              onChange={(e) => update({ cet6IncludeBase: e.target.checked })}
              className="h-5 w-5 accent-indigo-600"
            />
          </label>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">词单（学习范围）</h2>
        <p className="mt-1 text-xs text-slate-500">
          先选词单，系统再按它安排每天的新词。随时可换，已学进度不会丢。
        </p>
        <div className="mt-3 space-y-2">
          {STUDY_SCOPES.map((sc) => {
            const count = scopeInfo?.[sc.key] ?? 0;
            const active = settings.studyScope === sc.key;
            return (
              <button
                key={sc.key}
                onClick={() => update({ studyScope: sc.key })}
                className={`w-full rounded-xl border p-3.5 text-left transition ${
                  active ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{sc.label}</span>
                  <span className="text-xs tabular-nums text-slate-500">{count} 词</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{sc.desc}</div>
              </button>
            );
          })}
        </div>
        {plan ? (
          <p className="mt-2 text-xs text-slate-400">
            当前词单「{plan.scopeName}」共 {plan.scopedTotal} 词，已学 {plan.learned}，剩余 {plan.remaining}。
          </p>
        ) : null}
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
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">新词数量</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SegButton active={settings.newPlanMode === "custom"} onClick={() => update({ newPlanMode: "custom" })}>
            自定义每天数量
          </SegButton>
          <SegButton active={settings.newPlanMode === "exam"} onClick={() => update({ newPlanMode: "exam" })}>
            考前背完（自动倒推）
          </SegButton>
        </div>

        {settings.newPlanMode === "custom" ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">每天新学</span>
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
              按每个新词约 {SECONDS_PER_NEW_WORD} 秒估算，约需 {estimateMinutes} 分钟（不含复习）；复习每张约{" "}
              {SECONDS_PER_REVIEW} 秒。
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">提前多少天完成第一轮</span>
              <span className="font-semibold tabular-nums text-indigo-600">{settings.examBufferDays} 天</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={settings.examBufferDays}
              onChange={(e) => update({ examBufferDays: Number(e.target.value) })}
              className="w-full accent-indigo-600"
            />
            <div className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900">
              距离考试 <span className="font-semibold">{Math.max(0, left)}</span> 天，词单还剩{" "}
              <span className="font-semibold">{plan?.remaining ?? 0}</span> 词 → 每天需要学{" "}
              <span className="font-semibold">{plan?.perDayNeeded ?? 0}</span> 个新词
              {settings.examBufferDays > 0 ? `（留 ${settings.examBufferDays} 天复习冲刺）` : ""}。
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          今日实际安排：新词 <span className="font-semibold text-slate-700">{effectiveDaily}</span> 个 · 复习{" "}
          <span className="font-semibold text-slate-700">{plan?.reviewTarget ?? 0}</span> 个
          {plan?.minNewApplied ? "（为保证每天都有新词，已补足到至少 5 个）" : ""}
          {(plan?.reviewOverflow ?? 0) > 0 ? `（另有 ${plan?.reviewOverflow} 张顺延到明天）` : ""}；预计用时约{" "}
          {plan?.timeEstimate.totalMinutes ?? 0} 分钟（仅参考）。每天都会同时安排新词和复习。
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">学习节奏</h2>
        <div className="mt-4 space-y-5">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">每日复习量上限</span>
              <span className="font-semibold tabular-nums text-indigo-600">
                {settings.dailyReview === 0 ? "不限" : `${settings.dailyReview} 张`}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0, 20, 40, 60, 100].map((n) => (
                <SegButton key={n} active={settings.dailyReview === n} onClick={() => update({ dailyReview: n })}>
                  {n === 0 ? "不限" : `${n} 张`}
                </SegButton>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              超过上限的到期卡片会顺延到明天（复习优先，不会丢）。设置为“不限”时会尽量当天清完。
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">每背完多少个词小结复习一次</span>
              <span className="font-semibold tabular-nums text-indigo-600">
                {settings.batchReview === 0 ? "关闭" : `${settings.batchReview} 个`}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0, 5, 8, 10, 15].map((n) => (
                <SegButton key={n} active={settings.batchReview === n} onClick={() => update({ batchReview: n })}>
                  {n === 0 ? "关闭" : `${n} 个`}
                </SegButton>
              ))}
            </div>
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
            ：按配额优先复习高频词、错词、遗忘词、真题词与熟词僻义。当前状态：
            <span className="font-medium text-rose-600">{left <= 20 && left >= 0 ? "已开启" : "未开启"}</span>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">AI 助手（DeepSeek）</h2>
        <p className="mt-1 text-xs text-slate-500">
          需要填写你自己的 DeepSeek API Key 才能使用 AI 助记 / AI 例句 / AI 解释；不填就不显示 AI 功能，其他功能不受影响。
          Key 只保存在这台电脑的浏览器里，不会上传到别处。
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-600">API Key（每个用户填自己的）</span>
            <input
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onBlur={() => update({ aiKey: keyDraft.trim() })}
              placeholder="sk-..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-slate-600">模型</span>
              <select
                value={settings.aiModel}
                onChange={(e) => update({ aiModel: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              >
                <option value="deepseek-chat">deepseek-chat（响应快）</option>
                <option value="deepseek-reasoner">deepseek-reasoner（推理强）</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">接口地址</span>
              <input
                value={settings.aiBaseUrl}
                onChange={(e) => update({ aiBaseUrl: e.target.value })}
                onBlur={(e) => update({ aiBaseUrl: e.target.value.trim() || "https://api.deepseek.com" })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-600">专业 / 兴趣背景（用于生成贴合你的 AI 例句）</span>
            <input
              value={settings.aiMajor}
              onChange={(e) => update({ aiMajor: e.target.value })}
              placeholder="例如：工科、计算机、医学、喜欢旅行"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5">
            <span>
              <span className="text-sm text-slate-800">学新词时自动生成 AI 助记</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                开启后每个新词会自动请求一次助记（按量消耗你的 DeepSeek 额度），默认关闭
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.autoAiMnemonic}
              onChange={(e) => update({ autoAiMnemonic: e.target.checked })}
              className="h-5 w-5 accent-indigo-600"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={btn.ghost}
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                setTestResult(null);
                const res = await testAiConnection({ ...settings, aiKey: keyDraft.trim() });
                setTestResult(res);
                setTesting(false);
              }}
            >
              {testing ? "测试中…" : "测试连接"}
            </button>
            {testResult ? (
              <span className={testResult.ok ? "text-xs text-emerald-600" : "text-xs text-rose-600"}>
                {testResult.message}
                {testResult.ok && testResult.reply ? ` · 回复：${testResult.reply.trim().slice(0, 20)}` : ""}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-400">
            AI 结果会按「单词 + 任务 + 模型」缓存在本地，同一个单词不会重复消耗额度。
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">数据管理</h2>
        <p className="mt-1 text-xs text-slate-500">学习数据保存在本机。换到桌面程序时，可在旧版导出，再在这里导入。</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button className={btn.ghost} onClick={exportData}>
            <Download className="h-4 w-4" />
            导出学习数据
          </button>
          <label className={btn.ghost + " cursor-pointer"}>
            <Upload className="h-4 w-4" />
            导入学习数据
            <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importData(file);
              event.target.value = "";
            }} />
          </label>
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
          <li>记忆算法：ts-fsrs（FSRS）。认识 = Good、模糊 = Hard、不认识 = Again，系统据此决定这个单词之后的出现频率。</li>
          <li>答“不认识 / 模糊”的单词会在今天的队列里反复出现，直到你选“认识”。</li>
          <li>词库共 {cet4Count} 个四级词、{cet6Count} 个六级词，重复词自动合并为 CET-4 + CET-6 双标签。</li>
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className={btn.ghost}
            disabled={checkingUpdate}
            onClick={async () => {
              setCheckingUpdate(true);
              setUpdateMessage(null);
              try {
                const res = await fetch("/api/update", { method: "POST" });
                const data = (await res.json()) as { message?: string };
                setUpdateMessage(data.message || "检查完成");
              } catch (err) {
                setUpdateMessage(`检查失败：${(err as Error).message}`);
              }
              setCheckingUpdate(false);
            }}
          >
            {checkingUpdate ? "检查中…" : "检查更新"}
          </button>
          {updateMessage ? <span className="text-xs text-slate-600">{updateMessage}</span> : null}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          免安装版可通过 update-config.txt 配置更新源；桌面安装版请使用新版安装包升级。
        </p>
      </Card>
    </div>
  );
}
