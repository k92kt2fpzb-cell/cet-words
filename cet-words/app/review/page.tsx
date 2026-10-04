import { StudySession } from "@/components/study-session";

export default function ReviewPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">今日复习</h1>
        <p className="text-sm text-slate-500">Review First：先清复习债务，再学新词</p>
      </header>
      <StudySession mode="review" />
    </div>
  );
}
