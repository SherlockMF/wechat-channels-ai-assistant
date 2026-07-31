import Link from "next/link";
import { ScriptCreateForm } from "@/features/script-workbench/script-create-form";
import { Button, PageHeader } from "@/components/ui";

export default function NewScriptPage() {
  return (
    <>
      <PageHeader
        eyebrow="New Script"
        title="新建脚本"
        description="先选制作形态，再填想法或现场要点，生成可拍/可剪稿。"
        action={
          <Link href="/scripts">
            <Button variant="secondary">返回列表</Button>
          </Link>
        }
      />
      <ScriptCreateForm />
    </>
  );
}
