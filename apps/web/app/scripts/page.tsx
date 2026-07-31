import Link from "next/link";
import { ScriptList } from "@/features/script-workbench/script-list";
import { Button, PageHeader } from "@/components/ui";

export default function ScriptsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Script Workbench"
        title="脚本工作台"
        description="按制作形态生成口播稿或跟拍/成片大纲，复制到备忘录或剪映使用。"
        action={
          <Link href="/scripts/new">
            <Button>新建脚本</Button>
          </Link>
        }
      />
      <ScriptList />
    </>
  );
}
