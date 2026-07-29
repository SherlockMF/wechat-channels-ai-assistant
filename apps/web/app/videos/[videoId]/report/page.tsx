import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportEditor } from "@/features/reports/report-editor";
import { PageHeader } from "@/components/ui";

export default async function ReportPage({
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
  const diagnosisHref = `/videos/${videoId}?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <>
      <PageHeader
        eyebrow="Editable Report"
        title="运营与剪辑执行稿"
        description="这是可编辑建议，不是最终结论。保存后刷新仍保留修改，也可以复制或导出 Markdown。"
        action={
          <Link
            href={diagnosisHref}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-bold text-pine transition hover:bg-fog"
          >
            <ArrowLeft size={15} />
            返回视频诊断
          </Link>
        }
      />
      <ReportEditor videoId={videoId} diagnosisHref={diagnosisHref} />
    </>
  );
}
