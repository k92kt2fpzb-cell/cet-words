"use client";

import { formatCnDate, parseDateKey } from "@/lib/date";

export function BarChart({
  data,
  height = 150,
  tone = "indigo",
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  tone?: "indigo" | "sky" | "emerald";
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const colors = { indigo: "bg-indigo-500", sky: "bg-sky-400", emerald: "bg-emerald-500" };
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] tabular-nums text-slate-500">{d.value}</span>
          <div
            className={`w-full rounded-t-lg ${colors[tone]} transition-all`}
            style={{ height: `${Math.max(2, (d.value / max) * (height - 46))}px` }}
            title={d.hint}
          />
          <span className="text-[11px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function StackedBars({
  data,
  height = 170,
}: {
  data: { date: string; newWords: number; reviews: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.newWords + d.reviews));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d) => {
          const total = d.newWords + d.reviews;
          const h = Math.max(2, (total / max) * (height - 28));
          const newH = total ? (d.newWords / total) * h : 0;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center justify-end" title={`${formatCnDate(d.date)} 新词 ${d.newWords} / 复习 ${d.reviews}`}>
              <div className="w-full overflow-hidden rounded-t-md bg-slate-100" style={{ height: h }}>
                <div className="w-full bg-sky-400" style={{ height: h - newH }} />
                <div className="w-full bg-indigo-500" style={{ height: newH }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>{formatCnDate(data[0]?.date ?? "")}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm bg-indigo-500" />新词
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm bg-sky-400" />复习
          </span>
        </span>
        <span>{formatCnDate(data[data.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}

export function Ring({
  value,
  size = 132,
  stroke = 12,
  label,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#4f46e5"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{Math.round(clamped * 100)}%</span>
        {label ? <span className="text-xs text-slate-500">{label}</span> : null}
        {sub ? <span className="text-[11px] text-slate-400">{sub}</span> : null}
      </div>
    </div>
  );
}

/** 学习日历：按周分列的打卡热力图 */
export function ActivityCalendar({
  days,
}: {
  days: { date: string; newWords: number; reviews: number }[];
}) {
  if (!days.length) return null;
  const max = Math.max(1, ...days.map((d) => d.newWords + d.reviews));
  const first = parseDateKey(days[0].date);
  const lead = (first.getDay() + 6) % 7; // 周一为第一行
  const cells: (typeof days[number] | null)[] = [...Array(lead).fill(null), ...days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (total: number) => {
    if (total === 0) return "bg-slate-100";
    const ratio = total / max;
    if (ratio < 0.34) return "bg-indigo-200";
    if (ratio < 0.67) return "bg-indigo-400";
    return "bg-indigo-600";
  };
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col gap-[3px] pb-[18px] pt-[0px] text-[10px] leading-[14px] text-slate-400">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
            <span key={d} className="h-[14px]">
              {d}
            </span>
          ))}
        </div>
        <div className="flex flex-1 gap-[3px] overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {Array.from({ length: 7 }).map((_, di) => {
                const cell = week[di] ?? null;
                return (
                  <div
                    key={di}
                    title={cell ? `${formatCnDate(cell.date)} 新词 ${cell.newWords} · 复习 ${cell.reviews}` : ""}
                    className={`h-[14px] w-[14px] rounded-[4px] ${
                      cell ? level(cell.newWords + cell.reviews) : "bg-transparent"
                    }`}
                  />
                );
              })}
              <span className="mt-0.5 text-center text-[10px] text-slate-400">
                {formatCnDate(week.find(Boolean)?.date ?? "")
                  .replace(/\s/g, "")
                  .replace("月", "/")
                  .replace("日", "")}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
        <span>少</span>
        {["bg-slate-100", "bg-indigo-200", "bg-indigo-400", "bg-indigo-600"].map((c) => (
          <i key={c} className={`inline-block h-2.5 w-2.5 rounded-[3px] ${c}`} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}
