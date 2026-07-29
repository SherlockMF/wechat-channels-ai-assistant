import fs from "node:fs/promises";
import path from "node:path";
import type { VideoAsset } from "@video-diagnosis/shared-types";
import { parseWorkbook } from "../apps/web/lib/imports/parser";
import { normalizeTitle } from "../apps/web/lib/imports/normalize";
import { matchAssets } from "../apps/web/lib/matching/similarity";
import { sortByPublishedAt } from "../apps/web/lib/metrics/account";

async function main() {
  const root = path.resolve(__dirname, "..");
  const workbookBytes = await fs.readFile(
    path.join(root, "视频号动态数据明细_合并.xlsx"),
  );
  const preview = parseWorkbook(workbookBytes);
  const filenames = (await fs.readdir(path.join(root, "videoes"))).filter((name) =>
    /\.(mp4|mov|webm)$/i.test(name),
  );
  const assets: VideoAsset[] = filenames.map((filename, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  importId: "validation-import",
  originalFilename: filename,
  normalizedFilename: normalizeTitle(filename),
  storagePath: path.join(root, "videoes", filename),
  mimeType: "video/mp4",
  fileSize: 1,
  lastModifiedAt: null,
  durationSeconds: null,
  width: null,
  height: null,
  fps: null,
  processingStatus: "validation_only",
  }));
  const matches = matchAssets(assets, preview.records);
  const newest = sortByPublishedAt(preview.records)[0];

  console.log(
    JSON.stringify(
    {
      sheet: preview.sheetName,
      dataRows: preview.rowCount,
      validRecords: preview.records.length,
      invalidItems: preview.errors.length,
      videoFiles: filenames.length,
      matches: {
        matched: matches.filter((item) => item.status === "matched").length,
        needsReview: matches.filter((item) => item.status === "needs_review").length,
        unmatched: matches.filter((item) => item.status === "unmatched").length,
      },
      newestRecord: newest
        ? {
            spreadsheetRow: newest.spreadsheetRow,
            publishedAt: newest.publishedAt,
            description: newest.description.slice(0, 48),
          }
        : null,
    },
    null,
    2,
    ),
  );
}

void main();
