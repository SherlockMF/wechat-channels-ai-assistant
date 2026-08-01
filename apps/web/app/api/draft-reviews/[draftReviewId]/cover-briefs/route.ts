import { NextResponse } from "next/server";
import type { DraftCoverBrief } from "@video-diagnosis/shared-types";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { parseCoverBriefOptionsFromForm } from "@/lib/draft-review/cover-brief-options";
import {
  copyCoverBriefBackground,
  saveCoverBriefBackground,
} from "@/lib/storage/storage";
import { createAssetSignature } from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ draftReviewId: string }> };

export async function GET(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const draft = await repository.getDraftReview(ownerId, draftReviewId);
  if (!draft) {
    return NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
  }
  const items = await repository.listDraftCoverBriefs(ownerId, draftReviewId);
  const expires = Date.now() + 15 * 60_000;
  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      backgroundUrl: `/api/draft-reviews/${draftReviewId}/cover-briefs/${item.id}/background?owner=${encodeURIComponent(
        ownerId,
      )}&expires=${expires}&signature=${createAssetSignature(
        item.id,
        ownerId,
        expires,
      )}`,
    })),
  });
}

export async function POST(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const existing = await repository.getDraftReview(ownerId, draftReviewId);
  if (!existing) {
    return NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
  }
  try {
    const formData = await request.formData();
    const background = formData.get("background");
    const reuseBackgroundFromBriefId = String(
      formData.get("reuseBackgroundFromBriefId") ?? "",
    ).trim();
    const hasNewFile = background instanceof File && background.size > 0;

    let saved: {
      briefId: string;
      backgroundPath: string;
      backgroundMimeType: string;
    };
    if (hasNewFile) {
      saved = await saveCoverBriefBackground({
        ownerId,
        draftReviewId,
        file: background,
      });
    } else if (reuseBackgroundFromBriefId) {
      const source = await repository.getDraftCoverBrief(
        ownerId,
        draftReviewId,
        reuseBackgroundFromBriefId,
      );
      if (!source?.backgroundPath) {
        return NextResponse.json(
          { error: "找不到可复用的背景图" },
          { status: 400 },
        );
      }
      saved = await copyCoverBriefBackground({
        ownerId,
        draftReviewId,
        sourceBackgroundPath: source.backgroundPath,
        sourceMimeType: source.backgroundMimeType,
      });
    } else {
      return NextResponse.json({ error: "需要上传背景图" }, { status: 400 });
    }

    const description = String(formData.get("description") ?? "").trim();
    if (!description || description.length > 1000) {
      return NextResponse.json(
        { error: "请填写 1～1000 字的描述" },
        { status: 400 },
      );
    }
    const versionIdRaw = formData.get("versionId");
    const versionId =
      typeof versionIdRaw === "string" && versionIdRaw.trim()
        ? versionIdRaw.trim()
        : existing.viewingVersionId;
    const options = parseCoverBriefOptionsFromForm(formData);

    const now = new Date().toISOString();
    const brief: DraftCoverBrief = {
      id: saved.briefId,
      draftReviewId,
      versionId,
      backgroundPath: saved.backgroundPath,
      backgroundMimeType: saved.backgroundMimeType,
      userDescription: description,
      options,
      imagePrompt: null,
      titles: [],
      layoutNotes: null,
      provider: "pending",
      status: "processing",
      errorMessage: null,
      createdAt: now,
      completedAt: null,
    };
    const created = await repository.createDraftCoverBrief(ownerId, brief);
    if (!created) {
      return NextResponse.json({ error: "创建失败" }, { status: 422 });
    }
    const processed = await repository.processDraftCoverBrief(
      ownerId,
      draftReviewId,
      created.id,
    );
    return NextResponse.json({ brief: processed ?? created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "封面方案生成失败" },
      { status: 422 },
    );
  }
}
