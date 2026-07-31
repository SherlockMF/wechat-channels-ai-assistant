import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { saveCoverFromFrame } from "@/lib/storage/cover";

export const runtime = "nodejs";
type Context = { params: Promise<{ assetId: string }> };

const bodySchema = z.object({
  second: z.number().nonnegative().max(86_400),
});

export async function POST(request: Request, context: Context) {
  const { assetId } = await context.params;
  const ownerId = requestOwnerId(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "截帧秒数无效" }, { status: 400 });
  }
  const asset = await repository.getAsset(ownerId, assetId);
  if (!asset) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }
  try {
    const cover = await saveCoverFromFrame(
      ownerId,
      assetId,
      asset.storagePath,
      parsed.data.second,
    );
    const updated = await repository.updateAssetCover(ownerId, assetId, cover);
    return NextResponse.json({ asset: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "截帧失败" },
      { status: 422 },
    );
  }
}
