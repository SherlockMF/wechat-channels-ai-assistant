import type {
  ImportedVideoRecord,
  VideoAsset,
  VideoMatch,
} from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";
import {
  normalizePlatformVideoId,
  normalizeTitle,
} from "@/lib/imports/normalize";

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  return Array.from({ length: value.length - 1 }, (_, index) =>
    value.slice(index, index + 2),
  );
}

export function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.length === 0 || b.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const pair of b) remaining.set(pair, (remaining.get(pair) ?? 0) + 1);
  let overlap = 0;
  for (const pair of a) {
    const count = remaining.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      remaining.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

export function levenshteinSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left.length || !right.length) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - (previous[right.length] ?? 0) / Math.max(left.length, right.length);
}

export function combinedSimilarity(left: string, right: string): number {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return 0;
  const prefixLength = Math.min(25, a.length, b.length);
  const prefixMatch =
    prefixLength >= 8 && a.slice(0, prefixLength) === b.slice(0, prefixLength);
  const contains = a.includes(b) || b.includes(a);
  const bonus = prefixMatch || contains ? 1 : 0;
  return (
    0.55 * diceSimilarity(a, b) +
    0.35 * levenshteinSimilarity(a, b) +
    0.1 * bonus
  );
}

function platformIdFromFilename(filename: string): string | null {
  const match = filename.match(/(?:export\/)?([A-Za-z0-9_-]{20,})/u);
  return normalizePlatformVideoId(match?.[1] ?? null);
}

export function matchAsset(
  asset: VideoAsset,
  records: ImportedVideoRecord[],
): VideoMatch {
  const filenameId = platformIdFromFilename(asset.originalFilename);
  if (filenameId) {
    const byId = records.find(
      (record) => record.normalizedPlatformVideoId === filenameId,
    );
    if (byId) {
      return {
        id: createId(),
        videoAssetId: asset.id,
        videoRecordId: byId.id,
        method: "platform_id",
        similarityScore: 1,
        status: "matched",
        confirmedByUser: false,
        candidates: [],
      };
    }
  }

  const normalizedFilename = normalizeTitle(asset.originalFilename);
  const ranked = records
    .map((record) => ({
      videoRecordId: record.id,
      description: record.description,
      normalizedDescription: record.normalizedDescription,
      score: combinedSimilarity(normalizedFilename, record.normalizedDescription),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top.score < 0.7) {
    return {
      id: createId(),
      videoAssetId: asset.id,
      videoRecordId: null,
      method: "fuzzy",
      similarityScore: top?.score ?? 0,
      status: "unmatched",
      confirmedByUser: false,
      candidates: ranked,
    };
  }

  const exact = normalizedFilename === top.normalizedDescription;
  const contains =
    normalizedFilename.includes(top.normalizedDescription) ||
    top.normalizedDescription.includes(normalizedFilename);
  const ambiguous = Boolean(
    second && top.score - second.score <= 0.03 && second.score >= 0.7,
  );
  const autoMatch = top.score >= 0.88 && !ambiguous;

  return {
    id: createId(),
    videoAssetId: asset.id,
    videoRecordId: autoMatch ? top.videoRecordId : null,
    method: exact ? "exact_title" : contains ? "containment" : "fuzzy",
    similarityScore: top.score,
    status: autoMatch ? "matched" : "needs_review",
    confirmedByUser: false,
    candidates: ranked.map(({ normalizedDescription: _, ...candidate }) => candidate),
  };
}

export function matchAssets(
  assets: VideoAsset[],
  records: ImportedVideoRecord[],
): VideoMatch[] {
  return assets.map((asset) => matchAsset(asset, records));
}
