import { StudySession } from "@/components/study-session";

export default function LearnPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">学习新词</h1>
        <p className="text-sm text-slate-500">按考试权重排序：高频真题词 → 高频核心词 → 熟词僻义 → 中低频词</p>
      </header>
      <StudySession mode="learn" />
    </div>
  );
}
