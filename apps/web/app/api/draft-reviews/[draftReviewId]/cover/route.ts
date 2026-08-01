import path from "node:path";
import { NextResponse } from "next/server";
import { repository } from "@/lib/data/repository";
import {
  servePrivateFile,
  verifyAssetSignature,
} from "@/lib/storage/storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ draftReviewId: string }> };

function coverMime(coverPath: string): string {
  const extension = path.extname(coverPath).toLocaleLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(request: Request, context: Context) {
  const { draftReviewId } = await context.params;
  const url = new URL(request.url);
  const ownerId = url.searchParams.get("owner") ?? "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  const versionId = url.searchParams.get("version");
  if (!verifyAssetSignature(draftReviewId, ownerId, expires, signature)) {
    return NextResponse.json({ error: "签名无效或已过期" }, { status: 403 });
  }
  const payload = await repository.getDraftReview(ownerId, draftReviewId, {
    versionId,
  });
  if (!payload?.draft.coverPath) {
    return NextResponse.json({ error: "封面不存在" }, { status: 404 });
  }
  return servePrivateFile(
    request,
    payload.draft.coverPath,
    coverMime(payload.draft.coverPath),
    path.basename(payload.draft.coverPath),
  );
}
