import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VideoDiagnosis } from "@/features/videos/video-diagnosis";
import { PageHeader } from "@/components/ui";

export default async function VideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { videoId } = await params;
  const requestedReturnTo = (await searchParams).returnTo;
  const returnTo = requestedReturnTo?.startsWith("/analysis")
    ? requestedReturnTo
    : "/analysis";
  return (
    <>
      <PageHeader
        eyebrow="Video Diagnosis"
        title="单条视频诊断"
        description="数据事实、内容证据与合理推断分层展示。点击时间段可直接跳转到播放器位置。"
        action={
          <Link
            href={returnTo}
            scroll={false}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-bold text-pine transition hover:bg-fog"
          >
            <ArrowLeft size={15} />
            返回数据分析
          </Link>
        }
      />
      <VideoDiagnosis videoId={videoId} returnTo={returnTo} />
    </>
  );
}
