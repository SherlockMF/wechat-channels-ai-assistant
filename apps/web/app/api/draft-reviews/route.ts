import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { saveDraftReviewVideo } from "@/lib/storage/storage";
import { createAssetSignature } from "@/lib/storage/storage";
import { normalizeDraftTags } from "@/lib/draft-review/similar-videos";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ownerId = requestOwnerId(request);
  const items = await repository.listDraftReviews(ownerId);
  if (process.env.SITES_DEPLOYMENT !== "true") {
    const { enqueueDraftReviewAnalysis } = await import(
      "@/lib/draft-review/queue-runtime"
    );
    await Promise.all(
      items
        .filter(
          (item) =>
            (item.status === "uploaded" || item.status === "processing") &&
            item.currentVersionId,
        )
        .map((item) =>
          enqueueDraftReviewAnalysis({
            ownerId,
            draftReviewId: item.id,
            versionId: item.currentVersionId!,
            sourceScriptDraftId: item.sourceScriptDraftId ?? null,
          }),
        ),
    );
  }
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
    const sourceScriptDraftId =
      String(formData.get("sourceScriptDraftId") ?? "").trim() || null;
    if (sourceScriptDraftId && sourceScriptDraftId.length > 200) {
      return NextResponse.json({ error: "来源脚本 ID 无效" }, { status: 400 });
    }
    if (
      sourceScriptDraftId &&
      !(await repository.getScriptDraft(ownerId, sourceScriptDraftId))
    ) {
      return NextResponse.json({ error: "关联脚本不存在" }, { status: 404 });
    }
    const coverValue = formData.get("cover");
    const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
    const draft = await saveDraftReviewVideo(
      ownerId,
      file,
      title,
      goal,
      coverFile,
      tags,
      sourceScriptDraftId,
    );
    const created = await repository.createDraftReview(ownerId, draft);
    if (process.env.SITES_DEPLOYMENT === "true") {
      const processed = await repository.processDraftReview(ownerId, created.id);
      return NextResponse.json({ draft: processed ?? created }, { status: 201 });
    }
    const { enqueueDraftReviewAnalysis } = await import(
      "@/lib/draft-review/queue-runtime"
    );
    await enqueueDraftReviewAnalysis({
      ownerId,
      draftReviewId: created.id,
      versionId: created.currentVersionId!,
      sourceScriptDraftId: created.sourceScriptDraftId ?? null,
    });
    return NextResponse.json({ draft: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "审片创建失败" },
      { status: 422 },
    );
  }
}
