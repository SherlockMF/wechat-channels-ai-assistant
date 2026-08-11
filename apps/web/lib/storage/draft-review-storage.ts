import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { DraftReview, DraftReviewVersion } from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";
import {
  validateVideoFile,
  storageRoot,
} from "@/lib/storage/private-storage";
import { ensureCoverForVideo } from "@/lib/storage/cover";

const execFileAsync = promisify(execFile);

export function draftReviewStorageRoot(): string {
  return path.join(storageRoot(), "draft-reviews");
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
    };
  } catch {
    return {
      durationSeconds: null,
      width: null,
      height: null,
      fps: null,
    };
  }
}

async function writeVersionVideo(params: {
  ownerId: string;
  draftReviewId: string;
  versionNumber: number;
  versionId: string;
  file: File;
  coverFile?: File | null;
}): Promise<{
  storagePath: string;
  mimeType: string;
  fileSize: number;
  originalFilename: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  coverPath: string | null;
  coverSource: "uploaded" | "frame" | null;
  coverFrameSecond: number | null;
}> {
  validateVideoFile(params.file);
  const extension = path.extname(params.file.name).toLocaleLowerCase();
  const versionDirectory = path.join(
    draftReviewStorageRoot(),
    params.ownerId,
    params.draftReviewId,
    `v${params.versionNumber}`,
  );
  await fs.mkdir(versionDirectory, { recursive: true });
  const filePath = path.join(versionDirectory, `video${extension}`);
  await fs.writeFile(filePath, Buffer.from(await params.file.arrayBuffer()), {
    flag: "wx",
  });
  const metadata = await probeVideo(filePath);
  const cover = await ensureCoverForVideo({
    ownerId: params.ownerId,
    entityId: params.versionId,
    videoPath: filePath,
    durationSeconds: metadata.durationSeconds,
    coverFile: params.coverFile,
  });
  return {
    storagePath: filePath,
    mimeType: params.file.type || "application/octet-stream",
    fileSize: params.file.size,
    originalFilename: params.file.name,
    ...metadata,
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
  sourceScriptDraftId: string | null = null,
): Promise<DraftReview> {
  const id = createId();
  const versionId = createId();
  const media = await writeVersionVideo({
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
    sourceScriptDraftId: sourceScriptDraftId?.trim() || null,
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
  const versionId = createId();
  const media = await writeVersionVideo({
    ...params,
    versionId,
  });
  const now = new Date().toISOString();
  return {
    id: versionId,
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
