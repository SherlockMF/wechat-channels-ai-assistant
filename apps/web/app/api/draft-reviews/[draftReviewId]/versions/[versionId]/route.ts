import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";
type Context = {
  params: Promise<{ draftReviewId: string; versionId: string }>;
};

export async function DELETE(request: Request, context: Context) {
  const { draftReviewId, versionId } = await context.params;
  const ownerId = requestOwnerId(request);
  try {
    const draft = await repository.deleteDraftReviewVersion(
      ownerId,
      draftReviewId,
      versionId,
    );
    return draft
      ? NextResponse.json({ draft })
      : NextResponse.json({ error: "版本不存在" }, { status: 404 });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 422;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除版本失败" },
      { status: status === 422 ? 422 : 422 },
    );
  }
}
