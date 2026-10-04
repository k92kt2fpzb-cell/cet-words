"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Search, Star, TriangleAlert, Volume2, X } from "lucide-react";
import { useState } from "react";
import { AiPanel } from "@/components/ai-panel";
import { Badge, Card, btn } from "@/components/ui";
import { WordCard, tierStars } from "@/components/word-card";
import { STATUS_LABEL, humanInterval, statusOf } from "@/lib/fsrs";
import { formatCnDate } from "@/lib/date";
import { db } from "@/lib/db";
import { useAsync, useSettings } from "@/lib/hooks";
import { setPolyManual, setTroublesome, toggleFavorite } from "@/lib/scheduler";
import { speak } from "@/lib/speech";
import type { Progress, Word } from "@/lib/types";
import { levelOk } from "@/lib/wordbank";

type CatKey = "all" | "new" | "learning" | "mastered" | "favorite" | "wrong" | "troublesome" | "poly" | "high" | "exam";

const CATS: { key: CatKey; label: string }[] = [
  { key: "all", label: "全部单词" },
  { key: "new", label: "未学习" },
  { key: "learning", label: "学习中" },
  { key: "mastered", label: "已掌握" },
  { key: "favorite", label: "收藏" },
  { key: "wrong", label: "错词" },
  { key: "troublesome", label: "顽固词" },
  { key: "poly", label: "熟词僻义" },
  { key: "high", label: "高频词" },
  { key: "exam", label: "真题词" },
];

const PAGE = 60;

function isChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

function statusTone(status: string): "slate" | "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet" {
  switch (status) {
    case "mastered":
      return "emerald";
    case "lapsed":
      return "rose";
    case "learning":
      return "indigo";
    case "short":
      return "sky";
    case "long":
      return "violet";
    default:
      return "slate";
  }
}

export default function VocabularyPage() {
  const { settings } = useSettings();
  const [cat, setCat] = useState<CatKey>("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<Word | null>(null);

  const progressMap = useLiveQuery(
    async () => {
      const rows = await db.progress.toArray();
      return new Map(rows.map((r) => [r.word, r]));
    },
    [],
    new Map<string, Progress>(),
  );

  const selectedProgress = useLiveQuery(
    async () => (selected ? await db.progress.get(selected.word.toLowerCase()) : undefined),
    [selected?.id],
  );

  const { data, loading, reload } = useAsync(async () => {
    if (!settings) return { total: 0, words: [] as Word[] };
    const progress = await db.progress.toArray();
    const pmap = new Map(progress.map((p) => [p.word, p]));
    const levelProgress = progress.filter((p) => levelOk(p, settings.examType, settings.cet6IncludeBase));

    let ids: number[] = [];
    if (cat === "all" || cat === "new" || cat === "poly" || cat === "high" || cat === "exam") {
      const list = (await db.index.toArray()).filter((r) => levelOk(r, settings.examType, settings.cet6IncludeBase));
      let filtered = list;
      if (cat === "poly") filtered = list.filter((r) => r.poly === 1);
      if (cat === "high") filtered = list.filter((r) => (r.tier ?? 6) <= 2);
      if (cat === "exam") filtered = list.filter((r) => r.examCount > 0);
      if (cat === "new") filtered = list.filter((r) => !pmap.has(r.word.toLowerCase()));
      filtered.sort((a, b) => b.priority - a.priority);
      ids = filtered.map((r) => r.id);
    } else {
      let filtered = levelProgress;
      if (cat === "learning") {
        filtered = filtered.filter((p) => ["learning", "short", "long", "lapsed"].includes(statusOf(p)));
      }
      if (cat === "mastered") filtered = filtered.filter((p) => statusOf(p) === "mastered");
      if (cat === "favorite") filtered = filtered.filter((p) => p.favorite === 1);
      if (cat === "wrong") filtered = filtered.filter((p) => p.lapses > 0);
      if (cat === "troublesome") filtered = filtered.filter((p) => p.troublesome === 1);
      filtered.sort((a, b) => b.updatedAt - a.updatedAt);
      ids = filtered.map((p) => p.wordId);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      if (isChinese(q)) {
        const hits = await db.words
          .filter(
            (w) =>
              levelOk(w, settings.examType, settings.cet6IncludeBase) && w.trans.some((t) => t.cn.includes(q)),
          )
          .limit(80)
          .toArray();
        const allowed = new Set(hits.map((w) => w.id));
        ids = ids.filter((id) => allowed.has(id));
      } else {
        const words = await db.words.bulkGet(ids);
        ids = words.filter((w) => w && w.word.toLowerCase().includes(q)).map((w) => w!.id);
      }
    }

    const words = (await db.words.bulkGet(ids.slice(0, visible))).filter(Boolean) as Word[];
    return { total: ids.length, words };
  }, [settings, cat, query, visible]);

  const list = data?.words ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">单词本</h1>
        <p className="text-sm text-slate-500">
          {settings?.examType === "CET6" ? "CET-6" : "CET-4"} 词库 · 共 {data?.total ?? 0} 个单词
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(PAGE);
          }}
          placeholder="搜索单词或中文释义，例如 significance / 显著的"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setCat(c.key);
              setVisible(PAGE);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              cat === c.key ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? <div className="card p-8 text-center text-sm text-slate-500">加载中…</div> : null}
      {!loading && list.length === 0 ? <Card className="text-center text-sm text-slate-500">这里还没有单词。</Card> : null}

      <div className="space-y-2">
        {list.map((w) => {
          const p = progressMap.get(w.word.toLowerCase());
          return (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className="card flex w-full items-center justify-between gap-3 p-3.5 text-left transition hover:border-indigo-200"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-semibold text-slate-900">{w.word}</span>
                  {p ? <Badge tone={statusTone(p.status)}>{STATUS_LABEL[p.status]}</Badge> : null}
                  {p?.favorite === 1 ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {w.trans[0]?.pos} {w.trans[0]?.cn}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                <span>{tierStars(w.tier ?? 6).label}</span>
                <span>{tierStars(w.tier ?? 6).stars}</span>
              </div>
            </button>
          );
        })}
      </div>

      {!loading && (data?.total ?? 0) > list.length ? (
        <button className={`${btn.ghost} w-full`} onClick={() => setVisible((v) => v + PAGE)}>
          显示更多（{list.length} / {data?.total}）
        </button>
      ) : null}

      {selected ? (
        <div
          className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div className="w-full max-w-2xl space-y-3 py-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  className={`${btn.ghost} py-1.5 text-xs`}
                  onClick={async () => {
                    await toggleFavorite(selected);
                    reload();
                  }}
                >
                  <Star className="h-3.5 w-3.5" />
                  {selectedProgress?.favorite === 1 ? "取消收藏" : "加入收藏"}
                </button>
                <button
                  className={`${btn.ghost} py-1.5 text-xs`}
                  onClick={async () => {
                    await setTroublesome(selected, selectedProgress?.troublesome !== 1);
                    reload();
                  }}
                >
                  <TriangleAlert className="h-3.5 w-3.5" />
                  {selectedProgress?.troublesome === 1 ? "取消顽固标记" : "标记为顽固词"}
                </button>
                <button
                  className={`${btn.ghost} py-1.5 text-xs`}
                  onClick={async () => {
                    await setPolyManual(selected, selectedProgress?.polyManual !== 1);
                    reload();
                  }}
                >
                  <TriangleAlert className="h-3.5 w-3.5" />
                  {selectedProgress?.polyManual === 1 ? "移出熟词僻义专项" : "加入熟词僻义专项"}
                </button>
              </div>
              <button className={`${btn.ghost} py-1.5 text-xs`} onClick={() => setSelected(null)}>
                <X className="h-3.5 w-3.5" />
                关闭
              </button>
            </div>

            <WordCard word={selected} reveal={2} />

            <AiPanel word={selected} />

            <Card>
              <h3 className="text-sm font-semibold text-slate-900">学习数据</h3>
              {selectedProgress ? (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                  <div>
                    <div className="text-slate-400">状态</div>
                    <div className="font-medium text-slate-800">{STATUS_LABEL[statusOf(selectedProgress)]}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">下次复习</div>
                    <div className="font-medium text-slate-800">
                      {selectedProgress.due > Date.now() ? `${humanInterval(selectedProgress.due - Date.now())}后` : "现在"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">稳定度</div>
                    <div className="font-medium text-slate-800">{selectedProgress.stability.toFixed(1)} 天</div>
                  </div>
                  <div>
                    <div className="text-slate-400">难度</div>
                    <div className="font-medium text-slate-800">{selectedProgress.difficulty.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">复习次数</div>
                    <div className="font-medium text-slate-800">{selectedProgress.reps}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">遗忘次数</div>
                    <div className="font-medium text-slate-800">{selectedProgress.lapses}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">首次学习</div>
                    <div className="font-medium text-slate-800">
                      {selectedProgress.firstLearnedAt
                        ? formatCnDate(new Date(selectedProgress.firstLearnedAt).toISOString().slice(0, 10))
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">标记</div>
                    <div className="font-medium text-slate-800">
                      {[selectedProgress.favorite === 1 ? "收藏" : "", selectedProgress.troublesome === 1 ? "顽固" : ""]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">这个单词还没有学习记录，学习后会显示 FSRS 记忆数据。</p>
              )}
              <button className={`${btn.ghost} mt-3 py-1.5 text-xs`} onClick={() => speak(selected.word, "uk")}>
                <Volume2 className="h-3.5 w-3.5" />
                播放英音
              </button>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
