import { MatchWorkspace } from "@/features/matching/match-workspace";
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
        title={localSource ? "真实数据与视频关联" : "确认视频与数据的对应关系"}
        description={
          localSource
            ? "直接读取指定的已匹配工作簿与 videoes 目录；源文件保持只读，重复关联按工作簿原样保留。"
            : "ID 和高置信度标题会自动匹配；0.70～0.88 或存在相近候选时，必须人工确认。"
        }
      />
      <MatchWorkspace importId={importId} />
    </>
  );
}
