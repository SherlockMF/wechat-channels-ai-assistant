import { DraftReviewDetail } from "@/features/draft-review/draft-review-detail";
import { PageHeader } from "@/components/ui";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ draftReviewId: string }>;
}) {
  const { draftReviewId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Draft Review"
        title="审片报告"
        description="内容侧建议与账号基线对照；时间段为疑似问题区间，需结合画面人工复核。"
      />
      <DraftReviewDetail draftReviewId={draftReviewId} />
    </>
  );
}
