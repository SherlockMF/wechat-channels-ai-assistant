import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import type {
  ImportedVideoRecord,
  VideoAsset,
  VideoMatch,
} from "@video-diagnosis/shared-types";
import { parseWorkbook } from "@/lib/imports/parser";
import { normalizeTitle } from "@/lib/imports/normalize";
import type { AppState, ImportEntry } from "@/lib/data/types";

export const LOCAL_SOURCE_IMPORT_ID = "local-source";
const DEFAULT_SOURCE_WORKBOOK =
  "outputs/019fab89-e492-7a70-88d3-a82ff1206eed/视频号动态数据明细_已匹配视频名称.xlsx";
const DEFAULT_VIDEO_DIRECTORY = "videoes";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

interface LocalSourcePaths {
  workspaceRoot: string;
  workbookPath: string;
  videoDirectory: string;
}

export interface LocalSourceSnapshot {
  state: AppState;
  fingerprint: string;
  paths: LocalSourcePaths;
  matchedRelationshipCount: number;
  unmatchedAssetCount: number;
}

function workspaceRoot(): string {
  const configured = process.env.LOCAL_WORKSPACE_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "web" &&
    path.basename(path.dirname(cwd)).toLowerCase() === "apps"
    ? path.resolve(cwd, "..", "..")
    : cwd;
}

export function localSourcePaths(): LocalSourcePaths {
  const root = workspaceRoot();
  const resolveConfigured = (value: string | undefined, fallback: string) => {
    const selected = value?.trim() || fallback;
    return path.isAbsolute(selected)
      ? path.normalize(selected)
      : path.resolve(root, selected);
  };
  return {
    workspaceRoot: root,
    workbookPath: resolveConfigured(
      process.env.LOCAL_SOURCE_WORKBOOK,
      DEFAULT_SOURCE_WORKBOOK,
    ),
    videoDirectory: resolveConfigured(
      process.env.LOCAL_VIDEO_DIRECTORY,
      DEFAULT_VIDEO_DIRECTORY,
    ),
  };
}

function stableId(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(
    13,
    16,
  )}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

function mimeType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  return "video/mp4";
}

function matchedFilenames(buffer: Uint8Array): Map<number, string> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets["视频号数据明细"];
  if (!sheet) throw new Error("真实数据工作簿缺少“视频号数据明细”工作表");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
  const filenameIndex = headers.indexOf("视频名称");
  if (filenameIndex < 0) {
    throw new Error("真实数据工作簿缺少“视频名称”匹配列");
  }
  return new Map(
    rows.slice(1).map((row, index) => [
      index + 2,
      String((Array.isArray(row) ? row[filenameIndex] : null) ?? "").trim(),
    ]),
  );
}

export async function buildLocalSourceState(): Promise<LocalSourceSnapshot> {
  const paths = localSourcePaths();
  const [workbookBuffer, workbookStat, directoryEntries] = await Promise.all([
    fs.readFile(paths.workbookPath),
    fs.stat(paths.workbookPath),
    fs.readdir(paths.videoDirectory, { withFileTypes: true }),
  ]);
  const filenames = directoryEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const fileStats = await Promise.all(
    filenames.map(async (filename) => ({
      filename,
      stat: await fs.stat(path.join(paths.videoDirectory, filename)),
    })),
  );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        workbook: [workbookStat.size, workbookStat.mtimeMs],
        videos: fileStats.map(({ filename, stat }) => [
          filename,
          stat.size,
          stat.mtimeMs,
        ]),
      }),
    )
    .digest("hex");

  const preview = parseWorkbook(workbookBuffer, LOCAL_SOURCE_IMPORT_ID);
  if (preview.errors.length > 0 || preview.records.length === 0) {
    throw new Error(
      `真实数据工作簿校验失败：${preview.errors.length} 项错误，${preview.records.length} 条有效记录`,
    );
  }
  const records: ImportedVideoRecord[] = preview.records.map((record) => ({
    ...record,
    id: stableId(
      `record:${record.spreadsheetRow}:${record.normalizedPlatformVideoId ?? record.description}`,
    ),
    importId: LOCAL_SOURCE_IMPORT_ID,
  }));
  const recordByRow = new Map(
    records.map((record) => [record.spreadsheetRow, record]),
  );
  const filenamesByRow = matchedFilenames(workbookBuffer);
  const assets: VideoAsset[] = fileStats.map(({ filename, stat }) => ({
    id: stableId(`asset:${filename}`),
    importId: LOCAL_SOURCE_IMPORT_ID,
    originalFilename: filename,
    normalizedFilename: normalizeTitle(filename),
    storagePath: path.join(paths.videoDirectory, filename),
    mimeType: mimeType(filename),
    fileSize: stat.size,
    lastModifiedAt: stat.mtime.toISOString(),
    durationSeconds: null,
    width: null,
    height: null,
    fps: null,
    processingStatus: "source_ready",
  }));
  const assetByFilename = new Map(
    assets.map((asset) => [asset.originalFilename, asset]),
  );
  const matchedAssetIds = new Set<string>();
  const matches: VideoMatch[] = [];

  for (const [spreadsheetRow, filename] of filenamesByRow) {
    if (!filename) continue;
    const record = recordByRow.get(spreadsheetRow);
    const asset = assetByFilename.get(filename);
    if (!record || !asset) {
      throw new Error(
        `第 ${spreadsheetRow} 行匹配文件不存在：${filename || "空文件名"}`,
      );
    }
    matchedAssetIds.add(asset.id);
    matches.push({
      id: stableId(`match:${spreadsheetRow}:${filename}`),
      videoAssetId: asset.id,
      videoRecordId: record.id,
      method: "manual",
      similarityScore: 1,
      status: "matched",
      confirmedByUser: true,
      candidates: [
        {
          videoRecordId: record.id,
          description: record.description,
          score: 1,
        },
      ],
    });
  }
  for (const asset of assets) {
    if (matchedAssetIds.has(asset.id)) continue;
    matches.push({
      id: stableId(`unmatched:${asset.originalFilename}`),
      videoAssetId: asset.id,
      videoRecordId: null,
      method: "fuzzy",
      similarityScore: 0,
      status: "unmatched",
      confirmedByUser: false,
      candidates: [],
    });
  }

  const sourceImport: ImportEntry = {
    id: LOCAL_SOURCE_IMPORT_ID,
    ownerId: "local-user",
    originalFilename: path.basename(paths.workbookPath),
    sheetName: preview.sheetName,
    rowCount: preview.rowCount,
    validRowCount: preview.records.length,
    invalidRowCount: preview.errors.length,
    status: "imported",
    createdAt: workbookStat.mtime.toISOString(),
  };
  return {
    state: {
      imports: [sourceImport],
      records,
      assets,
      matches,
      jobs: [],
      results: [],
    },
    fingerprint,
    paths,
    matchedRelationshipCount: matches.filter(
      (match) => match.status === "matched",
    ).length,
    unmatchedAssetCount: matches.filter(
      (match) => match.status === "unmatched",
    ).length,
  };
}
