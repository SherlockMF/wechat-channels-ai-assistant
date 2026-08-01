import path from "node:path";
import { NextResponse } from "next/server";
import { repository } from "@/lib/data/repository";
import {
  servePrivateFile,
  verifyAssetSignature,
} from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ assetId: string }> };

function coverMime(coverPath: string): string {
  const extension = path.extname(coverPath).toLocaleLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

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
  if (!asset?.coverPath) {
    return NextResponse.json({ error: "封面不存在" }, { status: 404 });
  }
  return servePrivateFile(
    request,
    asset.coverPath,
    coverMime(asset.coverPath),
    path.basename(asset.coverPath),
  );
}
