import { NextResponse } from "next/server";
import { parseWorkbook, validateWorkbookFile } from "@/lib/imports/parser";

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
    return NextResponse.json({
      filename: file.name,
      sheetName: preview.sheetName,
      headers: preview.headers,
      rowCount: preview.rowCount,
      validRowCount: preview.records.length,
      invalidRowCount: preview.errors.length,
      duplicateRows: preview.duplicateRows,
      errors: preview.errors.slice(0, 100),
      sample: preview.records.slice(0, 8),
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 422;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Excel 解析失败" },
      { status: status === 413 || status === 415 ? status : 422 },
    );
  }
}
