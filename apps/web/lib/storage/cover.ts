import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { CoverSource } from "@video-diagnosis/shared-types";
import { storageRoot } from "@/lib/storage/private-storage";

const execFileAsync = promisify(execFile);

const coverExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const coverMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/octet-stream",
]);

export function fileBasename(filename: string): string {
  return path.basename(filename, path.extname(filename)).toLocaleLowerCase();
}

export function isCoverImageFile(file: File): boolean {
  const extension = path.extname(file.name).toLocaleLowerCase();
  if (!coverExtensions.has(extension)) return false;
  if (file.type && !coverMimeTypes.has(file.type)) return false;
  return true;
}

export function validateCoverImage(file: File): void {
  if (!isCoverImageFile(file)) {
    throw new Error(`${file.name}：封面仅支持 JPG、PNG、WebP`);
  }
  const maxBytes = 20 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) {
    throw new Error(`${file.name}：封面大小必须在 0～20MB`);
  }
}

export function pairCoversByBasename(
  videos: File[],
  covers: File[],
): Map<string, File> {
  const coverMap = new Map<string, File>();
  for (const cover of covers) {
    coverMap.set(fileBasename(cover.name), cover);
  }
  const paired = new Map<string, File>();
  for (const video of videos) {
    const cover = coverMap.get(fileBasename(video.name));
    if (cover) paired.set(video.name, cover);
  }
  return paired;
}

export function defaultCoverFrameSecond(durationSeconds: number | null): number {
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, durationSeconds - 0.05));
}

export async function extractVideoFrame(
  videoPath: string,
  outputPath: string,
  second: number,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-ss",
      String(Math.max(0, second)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath,
    ],
    { timeout: 60_000, maxBuffer: 1024 * 1024 },
  );
}

export async function saveCoverImageFile(
  ownerId: string,
  entityId: string,
  file: File,
): Promise<{ coverPath: string; coverSource: CoverSource; coverFrameSecond: null }> {
  validateCoverImage(file);
  const extension = path.extname(file.name).toLocaleLowerCase() || ".jpg";
  const directory = path.join(storageRoot(), ownerId, "covers");
  await fs.mkdir(directory, { recursive: true });
  const coverPath = path.join(directory, `${entityId}${extension}`);
  await fs.writeFile(coverPath, Buffer.from(await file.arrayBuffer()));
  return { coverPath, coverSource: "uploaded", coverFrameSecond: null };
}

export async function saveCoverFromFrame(
  ownerId: string,
  entityId: string,
  videoPath: string,
  second: number,
): Promise<{
  coverPath: string;
  coverSource: CoverSource;
  coverFrameSecond: number;
}> {
  const directory = path.join(storageRoot(), ownerId, "covers");
  await fs.mkdir(directory, { recursive: true });
  const coverPath = path.join(directory, `${entityId}-frame.jpg`);
  await extractVideoFrame(videoPath, coverPath, second);
  return {
    coverPath,
    coverSource: "frame",
    coverFrameSecond: second,
  };
}

export async function ensureCoverForVideo(input: {
  ownerId: string;
  entityId: string;
  videoPath: string;
  durationSeconds: number | null;
  coverFile?: File | null;
}): Promise<{
  coverPath: string | null;
  coverSource: CoverSource | null;
  coverFrameSecond: number | null;
}> {
  if (input.coverFile) {
    return saveCoverImageFile(input.ownerId, input.entityId, input.coverFile);
  }
  try {
    const second = defaultCoverFrameSecond(input.durationSeconds);
    return await saveCoverFromFrame(
      input.ownerId,
      input.entityId,
      input.videoPath,
      second,
    );
  } catch {
    return {
      coverPath: null,
      coverSource: null,
      coverFrameSecond: null,
    };
  }
}
