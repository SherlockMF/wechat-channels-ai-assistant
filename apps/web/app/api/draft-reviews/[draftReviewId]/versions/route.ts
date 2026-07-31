import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { saveDraftReviewVersionVideo } from "@/lib/storage/draft-review-storage";
import { normalizeDraftTags } from "@/lib/draft-review/similar-videos";

export const runtime = "nodejs";
type Context = { params: Promise<{ draftReviewId: string }> };

export async function POST(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const existing = await repository.getDraftReview(ownerId, draftReviewId);
  if (!existing) {
    return NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "需要上传一个视频文件" }, { status: 400 });
    }
    const titleRaw = formData.get("title");
    const goalRaw = formData.get("goal");
    const tagsRaw = formData.get("tags");
    const title =
      titleRaw === null
        ? existing.draft.title
        : String(titleRaw).trim() || null;
    const goal =
      goalRaw === null ? existing.draft.goal : String(goalRaw).trim() || null;
    const tags =
      tagsRaw === null
        ? existing.draft.tags ?? []
        : normalizeDraftTags(String(tagsRaw));
    const coverValue = formData.get("cover");
    const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
    const nextNumber =
      Math.max(0, ...existing.versions.map((item) => item.versionNumber)) + 1;
    const version = await saveDraftReviewVersionVideo({
      ownerId,
      draftReviewId,
      versionNumber: nextNumber,
      file,
      coverFile,
    });
    await repository.addDraftReviewVersion(ownerId, draftReviewId, version, {
      title,
      goal,
      tags,
    });
    const processed = await repository.processDraftReview(
      ownerId,
      draftReviewId,
      version.id,
    );
    return NextResponse.json(
      { draft: processed, versionId: version.id },
      { status: 201 },
    );
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 422;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传新版本失败" },
      { status: status === 409 ? 409 : 422 },
    );
  }
}
