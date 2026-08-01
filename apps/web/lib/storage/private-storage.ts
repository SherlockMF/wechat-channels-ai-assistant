import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { VideoAsset } from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";
import { normalizeTitle } from "@/lib/imports/normalize";

const execFileAsync = promisify(execFile);
const allowedExtensions = new Set([".mp4", ".mov", ".webm"]);
const allowedMimeTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/octet-stream",
]);

export function storageRoot(): string {
  const configured = process.env.PRIVATE_STORAGE_ROOT;
  return configured && path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), ".data", "uploads");
}

export function validateVideoFile(file: File): void {
  const extension = path.extname(file.name).toLocaleLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error(`${file.name}：仅支持 MP4、MOV、WebM`);
  }
  if (file.type && !allowedMimeTypes.has(file.type)) {
    throw new Error(`${file.name}：MIME 类型 ${file.type} 不受支持`);
  }
  const maxBytes = Number(process.env.MAX_VIDEO_FILE_MB ?? 500) * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) {
    throw new Error(`${file.name}：文件大小必须在 0～${maxBytes / 1024 / 1024}MB`);
  }
}

async function probeVideo(filePath: string) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height,r_frame_rate",
        "-of",
        "json",
        filePath,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const data = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
      }>;
    };
    const videoStream = data.streams?.find(
      (stream) => stream.codec_type === "video",
    );
    const [numerator, denominator] = (videoStream?.r_frame_rate ?? "0/1")
      .split("/")
      .map(Number);
    return {
      durationSeconds: data.format?.duration
        ? Number(data.format.duration)
        : null,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      fps:
        numerator && denominator && denominator !== 0
          ? numerator / denominator
          : null,
      processingStatus: "metadata_ready",
    };
  } catch {
    return {
      durationSeconds: null,
      width: null,
      height: null,
      fps: null,
      processingStatus: "uploaded",
    };
  }
}

export async function savePrivateVideo(
  ownerId: string,
  importId: string,
  file: File,
): Promise<VideoAsset> {
  validateVideoFile(file);
  const id = createId();
  const extension = path.extname(file.name).toLocaleLowerCase();
  const ownerDirectory = path.join(storageRoot(), ownerId);
  await fs.mkdir(ownerDirectory, { recursive: true });
  const filePath = path.join(ownerDirectory, `${id}${extension}`);
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()), {
    flag: "wx",
  });
  const metadata = await probeVideo(filePath);
  return {
    id,
    importId,
    originalFilename: file.name,
    normalizedFilename: normalizeTitle(file.name),
    storagePath: filePath,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    lastModifiedAt: file.lastModified
      ? new Date(file.lastModified).toISOString()
      : null,
    ...metadata,
    coverPath: null,
    coverSource: null,
    coverFrameSecond: null,
  };
}

function signedPayload(assetId: string, ownerId: string, expires: number): string {
  return `${assetId}:${ownerId}:${expires}`;
}

export function createAssetSignature(
  assetId: string,
  ownerId: string,
  expires: number,
): string {
  const secret = process.env.SIGNED_URL_SECRET ?? "local-mode-private-file-secret";
  return createHmac("sha256", secret)
    .update(signedPayload(assetId, ownerId, expires))
    .digest("hex");
}

export function verifyAssetSignature(
  assetId: string,
  ownerId: string,
  expires: number,
  signature: string,
): boolean {
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = createAssetSignature(assetId, ownerId, expires);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function servePrivateFile(
  request: Request,
  filePath: string,
  mimeType: string,
  downloadName: string,
): Promise<Response> {
  try {
    const stat = await fs.stat(filePath);
    const commonHeaders = {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      "X-Content-Type-Options": "nosniff",
    };
    const rangeHeader = request.headers.get("range");
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
        createReadStream(filePath, { start, end }),
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
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        ...commonHeaders,
        "Content-Length": String(stat.size),
      },
    });
  } catch {
    return Response.json({ error: "文件已被清理或不可读" }, { status: 404 });
  }
}

export async function readPrivateFileAsDataUrl(
  filePath: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function servePrivateVideo(
  request: Request,
  asset: VideoAsset,
): Promise<Response> {
  return servePrivateFile(
    request,
    asset.storagePath,
    asset.mimeType,
    asset.originalFilename,
  );
}
