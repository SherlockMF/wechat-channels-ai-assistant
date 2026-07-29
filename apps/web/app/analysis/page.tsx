import { AnalysisQueue } from "@/features/analysis/analysis-queue";
import { PageHeader } from "@/components/ui";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ recent?: string }>;
}) {
  const requested = (await searchParams).recent;
  const initialRecent =
    requested === "10" || requested === "20" || requested === "all"
      ? requested
      : "5";
  return (
    <>
      <PageHeader
        eyebrow="Analysis Queue"
        title="近期视频优先分析"
        description="当前队列直接来自指定工作簿和 videoes 目录；按 Excel 发布时间降序，同一时间按原始行号升序。"
      />
      <AnalysisQueue initialRecent={initialRecent} />
    </>
  );
}
