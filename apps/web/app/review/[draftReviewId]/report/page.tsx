import { DraftReportEditor } from "@/features/draft-review/draft-report-editor";
import { PageHeader } from "@/components/ui";

export default async function DraftReportPage({
  params,
}: {
  params: Promise<{ draftReviewId: string }>;
}) {
  const { draftReviewId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Editable Report"
        title="审片报告编辑"
        description="可保存人工修改、复制全文或导出 Markdown。"
      />
      <DraftReportEditor draftReviewId={draftReviewId} />
    </>
  );
}
