import Link from "next/link";
import { DraftReviewList } from "@/features/draft-review/draft-review-list";
import { Button, PageHeader } from "@/components/ui";

export default function ReviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pre-publish Review"
        title="发布前审片"
        description="上传刚剪好的视频，获取剪辑修改建议，并对照账号历史基线。"
        action={
          <Link href="/review/new">
            <Button>上传新视频</Button>
          </Link>
        }
      />
      <DraftReviewList />
    </>
  );
}
