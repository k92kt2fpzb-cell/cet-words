import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

type Tone = "indigo" | "emerald" | "amber" | "rose" | "sky" | "slate" | "violet";

const TONE_SOLID: Record<Tone, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  slate: "bg-slate-400",
  violet: "bg-violet-500",
};

const TONE_SOFT: Record<Tone, string> = {
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  rose: "bg-rose-50 text-rose-700 border-rose-100",
  sky: "bg-sky-50 text-sky-700 border-sky-100",
  slate: "bg-slate-50 text-slate-600 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-100",
};

export function ProgressBar({
  value,
  max,
  tone = "indigo",
  className = "",
}: {
  value: number;
  max: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-slate-200/70 ${className}`}>
      <div className={`h-full rounded-full transition-all duration-300 ${TONE_SOLID[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_SOFT[tone]}`}>
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "slate",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const tones: Record<Tone, string> = {
    indigo: "text-indigo-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    sky: "text-sky-600",
    slate: "text-slate-700",
    violet: "text-violet-600",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <div className="text-base font-semibold text-slate-800">{title}</div>
      {desc ? <p className="max-w-md text-sm text-slate-500">{desc}</p> : null}
      {action}
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50",
  subtle:
    "inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700",
};
