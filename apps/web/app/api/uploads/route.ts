import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { matchAssets } from "@/lib/matching/similarity";
import { savePrivateVideo } from "@/lib/storage/private-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ownerId = requestOwnerId(request);
  try {
    const formData = await request.formData();
    const importId = String(formData.get("importId") ?? "");
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
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
    const bundle = await repository.getImport(ownerId, importId);
    if (!bundle) {
      return NextResponse.json({ error: "导入批次不存在" }, { status: 404 });
    }
    const assets = [];
    const errors: Array<{ filename: string; message: string }> = [];
    for (const file of files) {
      try {
        assets.push(await savePrivateVideo(ownerId, importId, file));
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
    return NextResponse.json({ summary, matches, errors }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "视频上传失败" },
      { status: 422 },
    );
  }
}
