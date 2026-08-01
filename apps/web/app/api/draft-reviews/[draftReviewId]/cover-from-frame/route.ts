import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { saveCoverImageFile } from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ draftReviewId: string }> };

const bodySchema = z.object({
  second: z.number().nonnegative().max(86_400),
});

export async function POST(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const ownerId = requestOwnerId(request);
  const formData = await request.formData();
  const parsed = bodySchema.safeParse({ second: Number(formData.get("second")) });
  const frameValue = formData.get("frame");
  const frame =
    frameValue instanceof File && frameValue.size > 0 ? frameValue : null;
  if (!parsed.success) {
    return NextResponse.json({ error: "截帧秒数无效" }, { status: 400 });
  }
  if (!frame) {
    return NextResponse.json({ error: "缺少截帧画面" }, { status: 400 });
  }
  const payload = await repository.getDraftReview(ownerId, draftReviewId);
  if (!payload) {
    return NextResponse.json({ error: "审片记录不存在" }, { status: 404 });
  }
  const versionId = payload.viewingVersionId || payload.draft.currentVersionId;
  try {
    const saved = await saveCoverImageFile(ownerId, versionId || draftReviewId, frame);
    const cover = {
      ...saved,
      coverSource: "frame" as const,
      coverFrameSecond: parsed.data.second,
    };
    if (versionId) {
      await repository.updateDraftReviewVersion(
        ownerId,
        draftReviewId,
        versionId,
        cover,
      );
    } else {
      await repository.updateDraftReview(ownerId, draftReviewId, cover);
    }
    const draft = (
      await repository.getDraftReview(ownerId, draftReviewId, { versionId })
    )?.draft;
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "截帧失败" },
      { status: 422 },
    );
  }
}
