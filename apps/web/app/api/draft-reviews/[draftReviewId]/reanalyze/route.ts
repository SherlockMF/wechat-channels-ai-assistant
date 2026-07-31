import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";
type Context = { params: Promise<{ draftReviewId: string }> };

export async function POST(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const body = await request.json().catch(() => ({}));
  const versionId =
    body && typeof body === "object" && typeof (body as { versionId?: unknown }).versionId === "string"
      ? (body as { versionId: string }).versionId
      : undefined;
  const existing = await repository.getDraftReview(ownerId, draftReviewId, {
    versionId,
  });
  if (!existing) {
    return NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
  }
  if (existing.draft.status === "processing") {
    return NextResponse.json({ error: "正在分析中，请稍后再试" }, { status: 409 });
  }
  try {
    const draft = await repository.processDraftReview(
      ownerId,
      draftReviewId,
      versionId || existing.viewingVersionId || undefined,
    );
    return draft
      ? NextResponse.json({ draft })
      : NextResponse.json({ error: "重新分析失败" }, { status: 422 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "重新分析失败" },
      { status: 422 },
    );
  }
}
