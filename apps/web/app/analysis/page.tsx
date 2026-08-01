import { AnalysisQueue } from "@/features/analysis/analysis-queue";
import { PageHeader } from "@/components/ui";
import { normalizeRecentRange } from "@/lib/analysis/recent-range";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ recent?: string }>;
}) {
  const initialRecent = normalizeRecentRange((await searchParams).recent);
  return (
    <>
      <PageHeader
        eyebrow="Data Analysis"
        title="发布后数据分析"
        description="当前队列直接来自指定工作簿和 videoes 目录；按 Excel 发布时间降序，同一时间按原始行号升序。"
      />
      <AnalysisQueue initialRecent={initialRecent} />
    </>
  );
}
