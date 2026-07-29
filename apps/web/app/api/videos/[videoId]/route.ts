import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { createAssetSignature } from "@/lib/storage/storage";

type Context = { params: Promise<{ videoId: string }> };

export async function GET(request: Request, context: Context) {
  const { videoId } = await context.params;
  const ownerId = requestOwnerId(request);
  const video = await repository.getVideo(ownerId, videoId);
  if (!video) {
    return NextResponse.json({ error: "视频记录不存在" }, { status: 404 });
  }
  const expires = Date.now() + 15 * 60_000;
  return NextResponse.json({
    ...video,
    asset: video.asset
      ? {
          ...video.asset,
          previewUrl: `/api/assets/${video.asset.id}?owner=${encodeURIComponent(
            ownerId,
          )}&expires=${expires}&signature=${createAssetSignature(
            video.asset.id,
            ownerId,
            expires,
          )}`,
        }
      : null,
  });
}
