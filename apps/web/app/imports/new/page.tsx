import { ImportWizard } from "@/features/imports/import-wizard";
import { PageHeader } from "@/components/ui";

export default function NewImportPage() {
  return (
    <>
      <PageHeader
        eyebrow="New Review Batch"
        title="创建一次内容诊断"
        description="先导入视频号数据，再上传本地视频。系统只自动确认高置信度匹配，异常候选会进入人工复核。"
      />
      <ImportWizard />
    </>
  );
}
