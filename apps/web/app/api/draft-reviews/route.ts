import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { saveDraftReviewVideo } from "@/lib/storage/storage";
import { createAssetSignature } from "@/lib/storage/storage";
import { normalizeDraftTags } from "@/lib/draft-review/similar-videos";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ownerId = requestOwnerId(request);
  const items = await repository.listDraftReviews(ownerId);
  const expires = Date.now() + 15 * 60_000;
  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      coverUrl: item.coverPath
        ? `/api/draft-reviews/${item.id}/cover?owner=${encodeURIComponent(
            ownerId,
          )}&expires=${expires}&signature=${createAssetSignature(
            item.id,
            ownerId,
            expires,
          )}`
        : null,
    })),
  });
}

export async function POST(request: Request) {
  const ownerId = requestOwnerId(request);
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "需要上传一个视频文件" }, { status: 400 });
    }
    const title =
      String(formData.get("title") ?? "").trim() ||
      file.name.replace(/\.[^.]+$/u, "").trim() ||
      null;
    const goal = String(formData.get("goal") ?? "").trim() || null;
    const tags = normalizeDraftTags(String(formData.get("tags") ?? ""));
    const coverValue = formData.get("cover");
    const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
    const draft = await saveDraftReviewVideo(ownerId, file, title, goal, coverFile, tags);
    const created = await repository.createDraftReview(ownerId, draft);
    const processed = await repository.processDraftReview(ownerId, created.id);
    return NextResponse.json({ draft: processed ?? created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "审片创建失败" },
      { status: 422 },
    );
  }
}
