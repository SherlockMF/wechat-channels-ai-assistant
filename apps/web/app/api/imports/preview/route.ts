import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/imports/parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择 Excel 文件" }, { status: 400 });
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json(
        { error: "仅支持 .xlsx 或 .xls 文件" },
        { status: 415 },
      );
    }
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Excel 解析失败" },
      { status: 422 },
    );
  }
}
