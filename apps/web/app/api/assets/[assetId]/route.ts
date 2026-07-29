import { NextResponse } from "next/server";
import { repository } from "@/lib/data/repository";
import {
  servePrivateVideo,
  verifyAssetSignature,
} from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, context: Context) {
  const { assetId } = await context.params;
  const url = new URL(request.url);
  const ownerId = url.searchParams.get("owner") ?? "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  if (!verifyAssetSignature(assetId, ownerId, expires, signature)) {
    return NextResponse.json({ error: "签名无效或已过期" }, { status: 403 });
  }
  const asset = await repository.getAsset(ownerId, assetId);
  if (!asset) {
    return NextResponse.json({ error: "文件不存在或无权访问" }, { status: 404 });
  }
  return servePrivateVideo(request, asset);
}
