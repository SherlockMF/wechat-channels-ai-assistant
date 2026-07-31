import { ScriptDetail } from "@/features/script-workbench/script-detail";
import { PageHeader } from "@/components/ui";

export default async function ScriptDetailPage({
  params,
}: {
  params: Promise<{ scriptId: string }>;
}) {
  const { scriptId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Script Detail"
        title="脚本详情"
        description="查看、改稿、复制；再生成会另存为新记录。"
      />
      <ScriptDetail scriptId={scriptId} />
    </>
  );
}
