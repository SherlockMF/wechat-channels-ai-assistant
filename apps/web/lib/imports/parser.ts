import * as XLSX from "xlsx";
import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";
import {
  normalizePlatformVideoId,
  normalizeTitle,
} from "@/lib/imports/normalize";

export const REQUIRED_SHEET = "视频号数据明细";

export function validateWorkbookFile(file: File): void {
  if (!/\.xlsx?$/iu.test(file.name)) {
    throw Object.assign(new Error("仅支持 .xlsx 或 .xls 文件"), { status: 415 });
  }
  const configuredMb = Number(process.env.MAX_WORKBOOK_FILE_MB ?? 20);
  const maxMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 20;
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) {
    throw Object.assign(new Error(`Excel 文件大小必须在 0～${maxMb}MB`), {
      status: 413,
    });
  }
}

const FIELD_NAMES = [
  "视频描述",
  "视频ID",
  "发布时间",
  "完播率",
  "平均播放时长",
  "播放量",
  "推荐",
  "喜欢",
  "评论量",
  "分享量",
  "关注量",
  "转发聊天和朋友圈",
  "设为铃声",
  "设为状态",
  "设为朋友圈封面",
  "企微链接点击次数",
  "企微链接点击人数",
  "添加到通讯录次数",
  "添加到通讯录人数",
] as const;

const NUMERIC_FIELDS = [
  "平均播放时长",
  "播放量",
  "推荐",
  "喜欢",
  "评论量",
  "分享量",
  "关注量",
  "转发聊天和朋友圈",
  "设为铃声",
  "设为状态",
  "设为朋友圈封面",
  "企微链接点击次数",
  "企微链接点击人数",
  "添加到通讯录次数",
  "添加到通讯录人数",
] as const;

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreview {
  sheetName: string;
  headers: string[];
  records: ImportedVideoRecord[];
  errors: ImportValidationError[];
  duplicateRows: number[];
  rowCount: number;
}

export function excelSerialToDate(value: number): Date {
  if (!Number.isFinite(value)) throw new Error("Excel 日期序列号无效");
  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + value * 86_400_000);
}

export function parseDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") return excelSerialToDate(value);
  const parsed = new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parsePercentage(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const normalized = value > 1 ? value / 100 : value;
    return normalized >= 0 && normalized <= 1 ? normalized : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const hasPercent = text.includes("%");
  const numeric = Number(text.replace(/[%\s,]/gu, ""));
  if (!Number.isFinite(numeric)) return null;
  const normalized = hasPercent || numeric > 1 ? numeric / 100 : numeric;
  return normalized >= 0 && normalized <= 1 ? normalized : null;
}

export function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .trim()
    .replace(/[\s,，]/gu, "")
    .replace(/[^\d.+-]/gu, "");
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseWorkbook(
  buffer: ArrayBuffer | Uint8Array,
  importId = "preview",
): ImportPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[REQUIRED_SHEET];
  if (!sheet) {
    throw new Error(`未找到工作表“${REQUIRED_SHEET}”`);
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const missingHeaders = FIELD_NAMES.filter((name) => !headerIndex.has(name));
  if (missingHeaders.length > 0) {
    throw new Error(`缺少字段：${missingHeaders.join("、")}`);
  }

  const errors: ImportValidationError[] = [];
  const duplicateRows: number[] = [];
  const records: ImportedVideoRecord[] = [];
  const seenVideoIds = new Set<string>();
  const get = (row: unknown[], field: string) =>
    row[headerIndex.get(field) ?? -1] ?? null;

  rows.slice(1).forEach((rowValue, index) => {
    const spreadsheetRow = index + 2;
    const row = Array.isArray(rowValue) ? rowValue : [];
    const description = String(get(row, "视频描述") ?? "").trim();
    const platformVideoIdRaw = get(row, "视频ID");
    const platformVideoId = platformVideoIdRaw
      ? String(platformVideoIdRaw).trim()
      : null;
    const normalizedPlatformVideoId =
      normalizePlatformVideoId(platformVideoIdRaw);
    const publishedAt = parseDateValue(get(row, "发布时间"));

    if (!description) {
      errors.push({
        row: spreadsheetRow,
        field: "视频描述",
        message: "不能为空",
      });
    }
    if (!publishedAt) {
      errors.push({
        row: spreadsheetRow,
        field: "发布时间",
        message: "无法识别日期",
      });
    }
    if (
      normalizedPlatformVideoId &&
      seenVideoIds.has(normalizedPlatformVideoId)
    ) {
      duplicateRows.push(spreadsheetRow);
      errors.push({
        row: spreadsheetRow,
        field: "视频ID",
        message: "同一视频ID已在本次导入中出现",
      });
    }

    const rowHasFatalError = errors.some(
      (error) => error.row === spreadsheetRow,
    );
    if (rowHasFatalError || !publishedAt || !description) return;
    if (normalizedPlatformVideoId) {
      seenVideoIds.add(normalizedPlatformVideoId);
    }

    const parsedNumbers = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field, parseNullableNumber(get(row, field))]),
    );
    const numberField = (field: (typeof NUMERIC_FIELDS)[number]) =>
      (parsedNumbers[field] as number | null | undefined) ?? null;
    const completionRate = parsePercentage(get(row, "完播率"));
    if (
      get(row, "完播率") !== null &&
      get(row, "完播率") !== "" &&
      completionRate === null
    ) {
      errors.push({
        row: spreadsheetRow,
        field: "完播率",
        message: "必须是 0～1 小数或百分比",
      });
      return;
    }

    records.push({
      id: createId(),
      importId,
      spreadsheetRow,
      platformVideoId,
      normalizedPlatformVideoId,
      description,
      normalizedDescription: normalizeTitle(description),
      publishedAt: publishedAt.toISOString(),
      completionRate,
      averageWatchSeconds: numberField("平均播放时长"),
      views: numberField("播放量"),
      recommendations: numberField("推荐"),
      likes: numberField("喜欢"),
      comments: numberField("评论量"),
      shares: numberField("分享量"),
      follows: numberField("关注量"),
      shareToChat: numberField("转发聊天和朋友圈"),
      setAsRingtone: numberField("设为铃声"),
      setAsStatus: numberField("设为状态"),
      setAsMomentsCover: numberField("设为朋友圈封面"),
      wecomLinkClicks: numberField("企微链接点击次数"),
      wecomLinkUsers: numberField("企微链接点击人数"),
      contactAddCount: numberField("添加到通讯录次数"),
      contactAddUsers: numberField("添加到通讯录人数"),
    });
  });

  return {
    sheetName: REQUIRED_SHEET,
    headers,
    records,
    errors,
    duplicateRows,
    rowCount: Math.max(0, rows.length - 1),
  };
}
