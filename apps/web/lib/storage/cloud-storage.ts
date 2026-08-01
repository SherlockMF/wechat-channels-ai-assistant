import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import type {
  CoverSource,
  DraftReview,
  DraftReviewVersion,
  VideoAsset,
} from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";
import { normalizeTitle } from "@/lib/imports/normalize";

interface R2Object {
  size: number;
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2BucketBinding {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream<Uint8Array>,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  head(key: string): Promise<{ size: number } | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2Object | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    objects: Array<{ key: string; size: number }>;
    truncated: boolean;
    cursor?: string;
  }>;
  delete(key: string): Promise<unknown>;
}

interface CloudBindings {
  MEDIA: R2BucketBinding;
  SIGNED_URL_SECRET?: string;
}

const allowedExtensions = new Set([".mp4", ".mov", ".webm"]);
const allowedMimeTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/octet-stream",
]);

function bindings(): CloudBindings {
  return (
    globalThis as typeof globalThis & { __SITES_ENV__?: CloudBindings }
  ).__SITES_ENV__ ?? ({} as CloudBindings);
}

function mediaBucket(): R2BucketBinding {
  const bucket = bindings().MEDIA;
  if (!bucket) throw new Error("Sites R2 binding `MEDIA` 不可用");
  return bucket;
}

function videoObjectKey(asset: Pick<VideoAsset, "id" | "originalFilename">): string {
  const extension = path.extname(asset.originalFilename).toLocaleLowerCase();
  return `videos/${asset.id}${extension}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, "-");
}

function fileExtension(filename: string, fallback: string): string {
  return path.extname(filename).toLocaleLowerCase() || fallback;
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

export async function savePrivateVideo(
  _ownerId: string,
  importId: string,
  file: File,
): Promise<VideoAsset> {
  validateVideoFile(file);
  const id = createId();
  const asset: VideoAsset = {
    id,
    importId,
    originalFilename: file.name,
    normalizedFilename: normalizeTitle(file.name),
    storagePath: videoObjectKey({ id, originalFilename: file.name }),
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    lastModifiedAt: file.lastModified
      ? new Date(file.lastModified).toISOString()
      : null,
    durationSeconds: null,
    width: null,
    height: null,
    fps: null,
    processingStatus: "uploaded",
    coverPath: null,
    coverSource: null,
    coverFrameSecond: null,
  };
  await mediaBucket().put(videoObjectKey(asset), await file.arrayBuffer(), {
    httpMetadata: { contentType: asset.mimeType },
  });
  return asset;
}

function signedPayload(assetId: string, ownerId: string, expires: number): string {
  return `${assetId}:${ownerId}:${expires}`;
}

export function createAssetSignature(
  assetId: string,
  ownerId: string,
  expires: number,
): string {
  const secret = bindings().SIGNED_URL_SECRET ?? "sites-owner-only-signature";
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

function commonHeaders(asset: VideoAsset): Headers {
  return new Headers({
    "Content-Type": asset.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
      asset.originalFilename,
    )}`,
    "X-Content-Type-Options": "nosniff",
  });
}

export async function servePrivateVideo(
  request: Request,
  asset: VideoAsset,
): Promise<Response> {
  const key = videoObjectKey(asset);
  const head = await mediaBucket().head(key);
  if (!head) return Response.json({ error: "文件不存在" }, { status: 404 });
  const headers = commonHeaders(asset);
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    const object = await mediaBucket().get(key);
    if (!object) return Response.json({ error: "文件不存在" }, { status: 404 });
    headers.set("Content-Length", String(head.size));
    return new Response(object.body, { headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
  if (!match) {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  const requestedStart = match[1] ? Number(match[1]) : null;
  const requestedEnd = match[2] ? Number(match[2]) : null;
  const start = requestedStart ?? Math.max(0, head.size - (requestedEnd ?? 0));
  const end = Math.min(requestedEnd ?? head.size - 1, head.size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= head.size) {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  const object = await mediaBucket().get(key, {
    range: { offset: start, length: end - start + 1 },
  });
  if (!object) return Response.json({ error: "文件不存在" }, { status: 404 });
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
  return new Response(object.body, { status: 206, headers });
}

function privateFileHeaders(mimeType: string, downloadName: string): Headers {
  return new Headers({
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    "X-Content-Type-Options": "nosniff",
  });
}

export async function servePrivateFile(
  request: Request,
  key: string,
  mimeType: string,
  downloadName: string,
): Promise<Response> {
  const head = await mediaBucket().head(key);
  if (!head) return Response.json({ error: "文件不存在" }, { status: 404 });
  const headers = privateFileHeaders(mimeType, downloadName);
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    const object = await mediaBucket().get(key);
    if (!object) return Response.json({ error: "文件不存在" }, { status: 404 });
    headers.set("Content-Length", String(head.size));
    return new Response(object.body, { headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
  if (!match) {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  const requestedStart = match[1] ? Number(match[1]) : null;
  const requestedEnd = match[2] ? Number(match[2]) : null;
  const start = requestedStart ?? Math.max(0, head.size - (requestedEnd ?? 0));
  const end = Math.min(requestedEnd ?? head.size - 1, head.size - 1);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= head.size
  ) {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  const object = await mediaBucket().get(key, {
    range: { offset: start, length: end - start + 1 },
  });
  if (!object) return Response.json({ error: "文件不存在" }, { status: 404 });
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
  return new Response(object.body, { status: 206, headers });
}

const coverExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const coverMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/octet-stream",
]);

function validateCoverImage(file: File): void {
  const extension = fileExtension(file.name, ".jpg");
  if (!coverExtensions.has(extension) || (file.type && !coverMimeTypes.has(file.type))) {
    throw new Error(`${file.name}：封面仅支持 JPG、PNG、WebP`);
  }
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
    throw new Error(`${file.name}：封面大小必须在 0～20MB`);
  }
}

export async function saveCoverImageFile(
  ownerId: string,
  entityId: string,
  file: File,
): Promise<{ coverPath: string; coverSource: CoverSource; coverFrameSecond: null }> {
  validateCoverImage(file);
  const key = `covers/${safeSegment(ownerId)}/${safeSegment(entityId)}${fileExtension(file.name, ".jpg")}`;
  await mediaBucket().put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/jpeg" },
  });
  return { coverPath: key, coverSource: "uploaded", coverFrameSecond: null };
}

export async function saveCoverFromFrame(): Promise<never> {
  throw new Error("云端截帧需要由浏览器上传当前画面");
}

async function saveDraftVersionMedia(params: {
  ownerId: string;
  draftReviewId: string;
  versionNumber: number;
  versionId: string;
  file: File;
  coverFile?: File | null;
}) {
  validateVideoFile(params.file);
  const key = `draft-reviews/${safeSegment(params.ownerId)}/${safeSegment(params.draftReviewId)}/v${params.versionNumber}/${safeSegment(params.versionId)}/video${fileExtension(params.file.name, ".mp4")}`;
  await mediaBucket().put(key, await params.file.arrayBuffer(), {
    httpMetadata: { contentType: params.file.type || "application/octet-stream" },
  });
  const cover = params.coverFile
    ? await saveCoverImageFile(params.ownerId, params.versionId, params.coverFile)
    : { coverPath: null, coverSource: null, coverFrameSecond: null };
  return {
    storagePath: key,
    mimeType: params.file.type || "application/octet-stream",
    fileSize: params.file.size,
    originalFilename: params.file.name,
    durationSeconds: null,
    width: null,
    height: null,
    fps: null,
    ...cover,
  };
}

export async function saveDraftReviewVideo(
  ownerId: string,
  file: File,
  title: string | null,
  goal: string | null,
  coverFile?: File | null,
  tags: string[] = [],
): Promise<DraftReview> {
  const id = createId();
  const versionId = createId();
  const media = await saveDraftVersionMedia({
    ownerId,
    draftReviewId: id,
    versionNumber: 1,
    versionId,
    file,
    coverFile,
  });
  const now = new Date().toISOString();
  return {
    id,
    ownerId,
    title: title?.trim() || null,
    goal: goal?.trim() || null,
    tags,
    currentVersionId: versionId,
    versionCount: 1,
    ...media,
    evidencePath: null,
    baselineImportId: null,
    status: "uploaded",
    progress: 0,
    currentStep: "uploaded",
    errorMessage: null,
    createdAt: now,
    completedAt: null,
  };
}

export async function saveDraftReviewVersionVideo(params: {
  ownerId: string;
  draftReviewId: string;
  versionNumber: number;
  file: File;
  coverFile?: File | null;
}): Promise<DraftReviewVersion> {
  const id = createId();
  const media = await saveDraftVersionMedia({ ...params, versionId: id });
  const now = new Date().toISOString();
  return {
    id,
    draftReviewId: params.draftReviewId,
    versionNumber: params.versionNumber,
    ...media,
    evidencePath: null,
    status: "uploaded",
    progress: 0,
    currentStep: "uploaded",
    errorMessage: null,
    createdAt: now,
    completedAt: null,
  };
}

export async function saveCoverBriefBackground(params: {
  ownerId: string;
  draftReviewId: string;
  file: File;
}) {
  validateCoverImage(params.file);
  const briefId = createId();
  const key = `draft-reviews/${safeSegment(params.ownerId)}/${safeSegment(params.draftReviewId)}/cover-briefs/${briefId}/bg${fileExtension(params.file.name, ".jpg")}`;
  await mediaBucket().put(key, await params.file.arrayBuffer(), {
    httpMetadata: { contentType: params.file.type || "image/jpeg" },
  });
  return {
    briefId,
    backgroundPath: key,
    backgroundMimeType: params.file.type || "image/jpeg",
  };
}

export async function copyCoverBriefBackground(params: {
  ownerId: string;
  draftReviewId: string;
  sourceBackgroundPath: string;
  sourceMimeType: string;
}) {
  const source = await mediaBucket().get(params.sourceBackgroundPath);
  if (!source) throw new Error("找不到可复用的背景图");
  const briefId = createId();
  const key = `draft-reviews/${safeSegment(params.ownerId)}/${safeSegment(params.draftReviewId)}/cover-briefs/${briefId}/bg${fileExtension(params.sourceBackgroundPath, ".jpg")}`;
  await mediaBucket().put(key, await source.arrayBuffer(), {
    httpMetadata: { contentType: params.sourceMimeType || "image/jpeg" },
  });
  return {
    briefId,
    backgroundPath: key,
    backgroundMimeType: params.sourceMimeType || "image/jpeg",
  };
}

export async function readPrivateFileAsDataUrl(
  key: string,
  mimeType: string,
): Promise<string | null> {
  const object = await mediaBucket().get(key);
  if (!object) return null;
  return `data:${mimeType};base64,${Buffer.from(await object.arrayBuffer()).toString("base64")}`;
}

export async function deletePrivateFiles(
  keys: Array<string | null | undefined>,
): Promise<void> {
  await Promise.all(
    keys
      .filter((key): key is string => Boolean(key))
      .map((key) => mediaBucket().delete(key)),
  );
}

export async function putMigratedVideo(
  asset: VideoAsset,
  body: ReadableStream<Uint8Array>,
) {
  await mediaBucket().put(videoObjectKey(asset), body, {
    httpMetadata: { contentType: asset.mimeType },
  });
  return { assetId: asset.id, bytes: asset.fileSize };
}

export async function migratedVideoInventory() {
  let cursor: string | undefined;
  let count = 0;
  let bytes = 0;
  do {
    const page = await mediaBucket().list({ prefix: "videos/", cursor });
    count += page.objects.length;
    bytes += page.objects.reduce((sum, object) => sum + object.size, 0);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { count, bytes };
}
