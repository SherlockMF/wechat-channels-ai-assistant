import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { repository } from "@/lib/data/repository";
import { verifyAssetSignature } from "@/lib/storage/private-storage";

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
  try {
    const stat = await fs.stat(asset.storagePath);
    const rangeHeader = request.headers.get("range");
    const commonHeaders = {
      "Content-Type": asset.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        asset.originalFilename,
      )}`,
      "X-Content-Type-Options": "nosniff",
    };
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
      if (!match) {
        return new Response(null, {
          status: 416,
          headers: { ...commonHeaders, "Content-Range": `bytes */${stat.size}` },
        });
      }
      const requestedStart = match[1] ? Number(match[1]) : null;
      const requestedEnd = match[2] ? Number(match[2]) : null;
      const start = requestedStart ?? Math.max(0, stat.size - (requestedEnd ?? 0));
      const end = Math.min(requestedEnd ?? stat.size - 1, stat.size - 1);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        start >= stat.size
      ) {
        return new Response(null, {
          status: 416,
          headers: { ...commonHeaders, "Content-Range": `bytes */${stat.size}` },
        });
      }
      const stream = Readable.toWeb(
        createReadStream(asset.storagePath, { start, end }),
      ) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        },
      });
    }
    const stream = Readable.toWeb(
      createReadStream(asset.storagePath),
    ) as ReadableStream;
    return new Response(stream, {
      headers: {
        ...commonHeaders,
        "Content-Length": String(stat.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "文件已被清理或不可读" }, { status: 404 });
  }
}
