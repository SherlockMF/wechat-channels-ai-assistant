import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { matchAssets } from "@/lib/matching/similarity";
import {
  saveCoverImageFile,
  savePrivateVideo,
} from "@/lib/storage/storage";
import {
  fileBasename,
  isCoverImageFile,
} from "@/lib/storage/cover-client";

function validateCoverImage(file: File): void {
  if (!isCoverImageFile(file)) {
    throw new Error(`${file.name}：封面仅支持 JPG、PNG、WebP`);
  }
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
    throw new Error(`${file.name}：封面大小必须在 0～20MB`);
  }
}

function pairCoversByBasename(
  videos: File[],
  covers: File[],
): Map<string, File> {
  const byName = new Map(covers.map((file) => [fileBasename(file.name), file]));
  return new Map(
    videos.flatMap((video) => {
      const cover = byName.get(fileBasename(video.name));
      return cover ? [[video.name, cover] as const] : [];
    }),
  );
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ownerId = requestOwnerId(request);
  try {
    const formData = await request.formData();
    const importId = String(formData.get("importId") ?? "");
    const allFiles = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    const coverFiles = [
      ...formData
        .getAll("covers")
        .filter((value): value is File => value instanceof File),
      ...allFiles.filter((file) => isCoverImageFile(file)),
    ];
    const files = allFiles.filter((file) => !isCoverImageFile(file));
    const maxFiles = Number(process.env.MAX_VIDEO_FILES ?? 100);
    if (!importId || files.length === 0) {
      return NextResponse.json(
        { error: "需要 importId 和至少一个视频文件" },
        { status: 400 },
      );
    }
    if (files.length > maxFiles) {
      return NextResponse.json(
        { error: `单次最多上传 ${maxFiles} 个视频` },
        { status: 413 },
      );
    }
    for (const cover of coverFiles) {
      validateCoverImage(cover);
    }
    const bundle = await repository.getImport(ownerId, importId);
    if (!bundle) {
      return NextResponse.json({ error: "导入批次不存在" }, { status: 404 });
    }
    const coverByVideoName = pairCoversByBasename(files, coverFiles);
    const assets = [];
    const errors: Array<{ filename: string; message: string }> = [];
    for (const file of files) {
      try {
        const asset = await savePrivateVideo(ownerId, importId, file);
        const coverFile = coverByVideoName.get(file.name);
        if (coverFile) {
          Object.assign(
            asset,
            await saveCoverImageFile(ownerId, asset.id, coverFile),
          );
        }
        assets.push(asset);
      } catch (error) {
        errors.push({
          filename: file.name,
          message: error instanceof Error ? error.message : "上传失败",
        });
      }
    }
    const matches = matchAssets(assets, bundle.records);
    const summary = await repository.addAssetsAndMatches(
      ownerId,
      assets,
      matches,
    );
    return NextResponse.json(
      {
        summary,
        matches,
        errors,
        coverStats: {
          uploaded: [...coverByVideoName.keys()].length,
          autoFrame: assets.filter((asset) => asset.coverSource === "frame").length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "视频上传失败" },
      { status: 422 },
    );
  }
}
