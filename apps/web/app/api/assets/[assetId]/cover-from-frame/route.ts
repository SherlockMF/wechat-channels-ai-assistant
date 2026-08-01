import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { saveCoverImageFile } from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ assetId: string }> };

const bodySchema = z.object({
  second: z.number().nonnegative().max(86_400),
});

export async function POST(request: Request, context: Context) {
  const { assetId } = await context.params;
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
  const asset = await repository.getAsset(ownerId, assetId);
  if (!asset) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }
  try {
    const saved = await saveCoverImageFile(ownerId, assetId, frame);
    const cover = {
      ...saved,
      coverSource: "frame" as const,
      coverFrameSecond: parsed.data.second,
    };
    const updated = await repository.updateAssetCover(ownerId, assetId, cover);
    return NextResponse.json({ asset: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "截帧失败" },
      { status: 422 },
    );
  }
}
