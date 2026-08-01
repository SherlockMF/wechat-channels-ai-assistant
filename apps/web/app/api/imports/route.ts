import { NextResponse } from "next/server";
import { parseWorkbook, validateWorkbookFile } from "@/lib/imports/parser";
import { repository, requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择 Excel 文件" }, { status: 400 });
    }
    validateWorkbookFile(file);
    const preview = parseWorkbook(await file.arrayBuffer());
    if (!preview.records.length) {
      return NextResponse.json(
        { error: "没有可导入的有效记录", errors: preview.errors },
        { status: 422 },
      );
    }
    const entry = await repository.createImport(
      requestOwnerId(request),
      file.name,
      preview.sheetName,
      preview.rowCount,
      preview.records,
      preview.errors.length,
    );
    return NextResponse.json(
      { import: entry, errors: preview.errors },
      { status: 201 },
    );
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 422;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: status === 413 || status === 415 ? status : 422 },
    );
  }
}
