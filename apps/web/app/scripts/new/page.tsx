import Link from "next/link";
import { ScriptCreateForm } from "@/features/script-workbench/script-create-form";
import { Button, PageHeader } from "@/components/ui";

export default async function NewScriptPage({
  searchParams,
}: {
  searchParams: Promise<{
    researchSource?: string;
    hotspotSnapshot?: string;
    hotspotCluster?: string;
    hotspotCard?: string;
    hotspotTitle?: string;
    idea?: string;
    creatorTopicId?: string;
  }>;
}) {
  const params = await searchParams;
  const researchSourceScriptId = params.researchSource?.trim() || undefined;
  const hotspotSnapshotId = params.hotspotSnapshot?.trim() || "";
  /** 标题随 query 带过来，避免为了渲染一行提示在服务端多读一次快照。 */
  const hotspotSeed = hotspotSnapshotId
    ? {
        snapshotId: hotspotSnapshotId,
        clusterId: params.hotspotCluster?.trim() || undefined,
        topicCardId: params.hotspotCard?.trim() || undefined,
        title: params.hotspotTitle?.trim() || "",
        idea: params.idea?.trim() || "",
      }
    : undefined;
  return (
    <>
      <PageHeader
        eyebrow="New Script"
        title={
          researchSourceScriptId
            ? "研究爆款并优化"
            : hotspotSeed
              ? "按热点选题写脚本"
              : "新建脚本"
        }
        description={
          researchSourceScriptId
            ? "以现有稿为原稿研究公开资料，优化后另存为新记录，原稿保持不变。"
            : hotspotSeed
              ? "热点只作为时效背景带入，效果、参数与价格仍需你自己提供证据。"
              : "填写想法或现场要点后直接生成；爆款研究可在结果页按需追加。"
        }
        action={
          <Link href="/scripts">
            <Button variant="secondary">返回列表</Button>
          </Link>
        }
      />
      <ScriptCreateForm
        researchSourceScriptId={researchSourceScriptId}
        hotspotSeed={hotspotSeed}
        creatorTopicId={params.creatorTopicId?.trim() || undefined}
      />
    </>
  );
}
