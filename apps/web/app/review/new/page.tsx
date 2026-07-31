import { DraftReviewUpload } from "@/features/draft-review/draft-review-upload";
import { PageHeader } from "@/components/ui";

export default function NewReviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Upload Draft"
        title="上传待审视频"
        description="视频必填；标题与发布目标选填，但填写后建议会更贴近你的发布意图。"
      />
      <DraftReviewUpload />
    </>
  );
}
