/** 与考试日期、打卡日历相关的日期工具（全部使用本地时区） */

export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** 从 from 到 to 的整天差（to - from） */
export function dayDiff(from: string, to: string): number {
  const a = parseDateKey(from).getTime();
  const b = parseDateKey(to).getTime();
  return Math.round((b - a) / 86400000);
}

/** 距离考试还有多少天（当天算 0） */
export function daysUntil(examDate: string, from: string = todayKey()): number {
  return dayDiff(from, examDate);
}

export function formatCnDate(key: string): string {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function weekdayCn(key: string): string {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][parseDateKey(key).getDay()];
}

function nthSaturday(year: number, month: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (6 - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** 下一次四六级笔试（每年 6 月 / 12 月的第二个周六） */
export function nextCetDate(now: Date = new Date()): string {
  const candidates = [
    nthSaturday(now.getFullYear(), 5, 2),
    nthSaturday(now.getFullYear(), 11, 2),
    nthSaturday(now.getFullYear() + 1, 5, 2),
  ];
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const hit = candidates.find((c) => c.getTime() >= t) || candidates[2];
  return dateKey(hit);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
