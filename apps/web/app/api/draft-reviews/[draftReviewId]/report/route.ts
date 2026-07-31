import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

const updateSchema = z.object({ markdown: z.string().min(1).max(200_000) });
type Context = { params: Promise<{ draftReviewId: string }> };

export async function GET(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const versionId = new URL(request.url).searchParams.get("version") ?? undefined;
  const markdown = await repository.draftReportMarkdown(
    requestOwnerId(request),
    draftReviewId,
    versionId,
  );
  return markdown === null
    ? NextResponse.json({ error: "报告尚未生成" }, { status: 404 })
    : NextResponse.json({ markdown });
}

export async function PATCH(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "报告内容无效" }, { status: 400 });
  }
  const versionId =
    typeof body?.versionId === "string" ? body.versionId : undefined;
  const result = await repository.saveDraftEditedReport(
    requestOwnerId(request),
    draftReviewId,
    parsed.data.markdown,
    versionId,
  );
  return result
    ? NextResponse.json({ saved: true, updatedAt: result.updatedAt })
    : NextResponse.json({ error: "报告不存在" }, { status: 404 });
}
