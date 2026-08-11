import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { createAssetSignature } from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ draftReviewId: string }> };

const patchSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  goal: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
});

export async function GET(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const versionId = new URL(request.url).searchParams.get("version");
  const payload = await repository.getDraftReview(ownerId, draftReviewId, {
    versionId,
  });
  if (!payload) {
    return NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
  }
  if (
    process.env.SITES_DEPLOYMENT !== "true" &&
    payload.viewingVersionId &&
    (payload.draft.status === "uploaded" || payload.draft.status === "processing")
  ) {
    const { enqueueDraftReviewAnalysis } = await import(
      "@/lib/draft-review/queue-runtime"
    );
    await enqueueDraftReviewAnalysis({
      ownerId,
      draftReviewId,
      versionId: payload.viewingVersionId,
      sourceScriptDraftId: payload.draft.sourceScriptDraftId ?? null,
    });
  }
  const expires = Date.now() + 15 * 60_000;
  const versionQuery = payload.viewingVersionId
    ? `&version=${encodeURIComponent(payload.viewingVersionId)}`
    : "";
  return NextResponse.json({
    ...payload,
    previewUrl: `/api/draft-reviews/${draftReviewId}/video?owner=${encodeURIComponent(
      ownerId,
    )}&expires=${expires}&signature=${createAssetSignature(
      draftReviewId,
      ownerId,
      expires,
    )}${versionQuery}`,
    coverUrl: payload.draft.coverPath
      ? `/api/draft-reviews/${draftReviewId}/cover?owner=${encodeURIComponent(
          ownerId,
        )}&expires=${expires}&signature=${createAssetSignature(
          draftReviewId,
          ownerId,
          expires,
        )}${versionQuery}`
      : null,
  });
}

export async function PATCH(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "标题或目标无效" }, { status: 400 });
  }
  const patch: {
    title?: string | null;
    goal?: string | null;
    tags?: string[];
  } = {};
  if ("title" in parsed.data) {
    patch.title = parsed.data.title?.trim() || null;
  }
  if ("goal" in parsed.data) {
    patch.goal = parsed.data.goal?.trim() || null;
  }
  if ("tags" in parsed.data && parsed.data.tags) {
    patch.tags = parsed.data.tags
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  const draft = await repository.updateDraftReview(ownerId, draftReviewId, patch);
  return draft
    ? NextResponse.json({ draft })
    : NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
}

export async function DELETE(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const deleted = await repository.deleteDraftReview(ownerId, draftReviewId);
  return deleted
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
}
