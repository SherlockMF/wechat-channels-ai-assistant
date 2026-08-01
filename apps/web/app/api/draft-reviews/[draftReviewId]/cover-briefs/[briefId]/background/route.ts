import path from "node:path";
import { NextResponse } from "next/server";
import { repository } from "@/lib/data/repository";
import {
  servePrivateFile,
  verifyAssetSignature,
} from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = {
  params: Promise<{ draftReviewId: string; briefId: string }>;
};

function mimeFor(filePath: string, fallback: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return fallback || "image/jpeg";
}

export async function GET(request: Request, context: Context) {
  const { draftReviewId, briefId } = await context.params;
  const url = new URL(request.url);
  const ownerId = url.searchParams.get("owner") ?? "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  if (!verifyAssetSignature(briefId, ownerId, expires, signature)) {
    return NextResponse.json({ error: "签名无效或已过期" }, { status: 403 });
  }
  const brief = await repository.getDraftCoverBrief(
    ownerId,
    draftReviewId,
    briefId,
  );
  if (!brief) {
    return NextResponse.json({ error: "封面方案不存在" }, { status: 404 });
  }
  return servePrivateFile(
    request,
    brief.backgroundPath,
    mimeFor(brief.backgroundPath, brief.backgroundMimeType),
    path.basename(brief.backgroundPath),
  );
}
