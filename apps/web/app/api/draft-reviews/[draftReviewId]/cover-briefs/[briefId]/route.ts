import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { createAssetSignature } from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = {
  params: Promise<{ draftReviewId: string; briefId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { draftReviewId, briefId } = await context.params;
  const ownerId = requestOwnerId(request);
  const brief = await repository.getDraftCoverBrief(
    ownerId,
    draftReviewId,
    briefId,
  );
  if (!brief) {
    return NextResponse.json({ error: "封面方案不存在" }, { status: 404 });
  }
  const expires = Date.now() + 15 * 60_000;
  return NextResponse.json({
    brief: {
      ...brief,
      backgroundUrl: `/api/draft-reviews/${draftReviewId}/cover-briefs/${brief.id}/background?owner=${encodeURIComponent(
        ownerId,
      )}&expires=${expires}&signature=${createAssetSignature(
        brief.id,
        ownerId,
        expires,
      )}`,
    },
  });
}

export async function DELETE(request: Request, context: Context) {
  const { draftReviewId, briefId } = await context.params;
  const ownerId = requestOwnerId(request);
  const deleted = await repository.deleteDraftCoverBrief(
    ownerId,
    draftReviewId,
    briefId,
  );
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "封面方案不存在" }, { status: 404 });
}
