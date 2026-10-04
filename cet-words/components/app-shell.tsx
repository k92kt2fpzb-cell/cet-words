"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Home, Library, Loader2, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ensureBankLoaded } from "@/lib/wordbank";

const NAV = [
  { href: "/", label: "今日", icon: Home },
  { href: "/learn", label: "学习", icon: BookOpen },
  { href: "/review", label: "复习", icon: RefreshCw },
  { href: "/vocabulary", label: "单词本", icon: Library },
  { href: "/stats", label: "数据", icon: BarChart3 },
];

type LoadState = { status: "loading" | "ready" | "error"; loaded: number; total: number; message?: string };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<LoadState>({ status: "loading", loaded: 0, total: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", loaded: 0, total: 0 });
    ensureBankLoaded((loaded, total) => {
      if (alive) setState({ status: "loading", loaded, total });
    })
      .then(({ total }) => {
        if (alive) setState({ status: "ready", loaded: total, total });
      })
      .catch((err: Error) => {
        if (alive) setState({ status: "error", loaded: 0, total: 0, message: err.message });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (state.status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="text-2xl font-semibold tracking-tight text-indigo-600">CET Words</div>
          <p className="mt-1 text-sm text-slate-500">四六级智能词汇学习与记忆管理系统</p>
          {state.status === "error" ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-rose-600">词库加载失败：{state.message}</p>
              <button
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                onClick={() => setAttempt((a) => a + 1)}
              >
                重试
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                {state.total > 0 ? `正在导入词库 ${state.loaded} / ${state.total}` : "正在准备词库…"}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: state.total ? `${Math.round((state.loaded / state.total) * 100)}%` : "8%" }}
                />
              </div>
              <p className="text-xs text-slate-400">首次运行需要把 4770 个四六级单词写入本地数据库（IndexedDB）</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 flex-col border-r border-slate-200 bg-white/80 p-4 backdrop-blur md:flex">
        <div className="px-2 py-3">
          <div className="text-lg font-semibold tracking-tight text-indigo-600">CET Words</div>
          <div className="text-[11px] text-slate-400">先清复习债务，再学新词</div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            pathname === "/settings" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          设置
        </Link>
      </aside>

      <main className="min-w-0 flex-1 pb-24 md:pb-10">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                active ? "text-indigo-600" : "text-slate-500"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
