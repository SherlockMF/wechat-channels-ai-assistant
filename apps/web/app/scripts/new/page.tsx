import Link from "next/link";
import { ScriptCreateForm } from "@/features/script-workbench/script-create-form";
import { Button, PageHeader } from "@/components/ui";

export default async function NewScriptPage({
  searchParams,
}: {
  searchParams: Promise<{ researchSource?: string }>;
}) {
  const { researchSource } = await searchParams;
  const researchSourceScriptId = researchSource?.trim() || undefined;
  return (
    <>
      <PageHeader
        eyebrow="New Script"
        title={researchSourceScriptId ? "研究爆款并优化" : "新建脚本"}
        description={
          researchSourceScriptId
            ? "以现有稿为原稿研究公开资料，优化后另存为新记录，原稿保持不变。"
            : "填写想法或现场要点后直接生成；爆款研究可在结果页按需追加。"
        }
        action={
          <Link href="/scripts">
            <Button variant="secondary">返回列表</Button>
          </Link>
        }
      />
      <ScriptCreateForm researchSourceScriptId={researchSourceScriptId} />
    </>
  );
}
