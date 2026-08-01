import { Suspense } from "react";
import { MatchWorkspace } from "@/features/matching/match-workspace";
import { MatchingDesk } from "@/features/matching/matching-desk";
import { PageHeader } from "@/components/ui";

export default async function MatchingPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  const localSource = importId === "local-source";
  return (
    <>
      <PageHeader
        eyebrow="Matching Review"
        title={localSource ? "数据匹配：工作簿与视频关联" : "确认视频与数据的对应关系"}
        description={
          localSource
            ? "可继续使用本地工作簿与 videoes 目录，也可上传新批次 Excel + 视频（同名封面可选）并自动匹配。"
            : "ID 和高置信度标题会自动匹配；0.70～0.88 或存在相近候选时，必须人工确认。"
        }
      />
      {localSource ? (
        <Suspense fallback={<div className="min-h-48 animate-pulse rounded-2xl bg-white" />}>
          <MatchingDesk defaultImportId={importId} />
        </Suspense>
      ) : (
        <MatchWorkspace importId={importId} />
      )}
    </>
  );
}
