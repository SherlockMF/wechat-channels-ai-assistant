import path from "node:path";
import fs from "node:fs/promises";
import { createId } from "@/lib/id";
import { validateCoverImage } from "@/lib/storage/cover";
import { draftReviewStorageRoot } from "@/lib/storage/draft-review-storage";

export async function saveCoverBriefBackground(params: {
  ownerId: string;
  draftReviewId: string;
  file: File;
}): Promise<{
  briefId: string;
  backgroundPath: string;
  backgroundMimeType: string;
}> {
  validateCoverImage(params.file);
  const briefId = createId();
  const extension = path.extname(params.file.name).toLocaleLowerCase() || ".jpg";
  const directory = path.join(
    draftReviewStorageRoot(),
    params.ownerId,
    params.draftReviewId,
    "cover-briefs",
    briefId,
  );
  await fs.mkdir(directory, { recursive: true });
  const backgroundPath = path.join(directory, `bg${extension}`);
  await fs.writeFile(
    backgroundPath,
    Buffer.from(await params.file.arrayBuffer()),
    { flag: "wx" },
  );
  return {
    briefId,
    backgroundPath,
    backgroundMimeType: params.file.type || "image/jpeg",
  };
}

/** 复用既有封面方案的背景图（复制到新 brief 目录，避免共用路径）。 */
export async function copyCoverBriefBackground(params: {
  ownerId: string;
  draftReviewId: string;
  sourceBackgroundPath: string;
  sourceMimeType: string;
}): Promise<{
  briefId: string;
  backgroundPath: string;
  backgroundMimeType: string;
}> {
  const briefId = createId();
  const extension =
    path.extname(params.sourceBackgroundPath).toLocaleLowerCase() || ".jpg";
  const directory = path.join(
    draftReviewStorageRoot(),
    params.ownerId,
    params.draftReviewId,
    "cover-briefs",
    briefId,
  );
  await fs.mkdir(directory, { recursive: true });
  const backgroundPath = path.join(directory, `bg${extension}`);
  await fs.copyFile(params.sourceBackgroundPath, backgroundPath);
  return {
    briefId,
    backgroundPath,
    backgroundMimeType: params.sourceMimeType || "image/jpeg",
  };
}
