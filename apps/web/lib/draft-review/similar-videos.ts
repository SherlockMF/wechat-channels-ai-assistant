import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import { normalizeTitle } from "@/lib/imports/normalize";
import { combinedSimilarity } from "@/lib/matching/similarity";

export interface SimilarVideoSummary {
  description: string;
  completionRate: number | null;
  averageWatchSeconds: number | null;
  views: number | null;
  likes: number | null;
  follows: number | null;
  similarityScore: number;
  matchedTags: string[];
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,，、|/；;]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function normalizeDraftTags(input: string[] | string | null | undefined): string[] {
  if (Array.isArray(input)) {
    return input
      .flatMap((item) => parseTags(item))
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, 12);
  }
  if (typeof input === "string") return parseTags(input);
  return [];
}

function tagHitScore(description: string, tags: string[]): { score: number; matched: string[] } {
  const normalizedDescription = normalizeTitle(description);
  if (!normalizedDescription || tags.length === 0) {
    return { score: 0, matched: [] };
  }
  const matched = tags.filter((tag) => {
    const normalizedTag = normalizeTitle(tag);
    return normalizedTag.length > 0 && normalizedDescription.includes(normalizedTag);
  });
  return {
    score: matched.length / tags.length,
    matched,
  };
}

/**
 * 按标签命中 + 标题相似度，从历史导入记录中选出可比视频。
 */
export function findSimilarVideosByTags(
  records: ImportedVideoRecord[],
  options: {
    tags: string[];
    title?: string | null;
    limit?: number;
  },
): SimilarVideoSummary[] {
  const tags = normalizeDraftTags(options.tags);
  const title = options.title?.trim() || "";
  const limit = options.limit ?? 8;
  if (records.length === 0) return [];

  const scored = records
    .map((record) => {
      const tag = tagHitScore(record.description, tags);
      const titleScore = title
        ? combinedSimilarity(title, record.description)
        : 0;
      // 有标签时优先标签命中；无标签时退回标题相似度
      const score =
        tags.length > 0
          ? tag.score * 0.72 + titleScore * 0.28
          : titleScore;
      return {
        record,
        score,
        matchedTags: tag.matched,
      };
    })
    .filter((item) => item.score >= (tags.length > 0 ? 0.18 : 0.28))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.record.views ?? 0) - (a.record.views ?? 0);
    })
    .slice(0, limit);

  return scored.map(({ record, score, matchedTags }) => ({
    description: record.description,
    completionRate: record.completionRate,
    averageWatchSeconds: record.averageWatchSeconds,
    views: record.views,
    likes: record.likes,
    follows: record.follows,
    similarityScore: Number(score.toFixed(3)),
    matchedTags,
  }));
}

export function formatSimilarVideosForPrompt(similar: SimilarVideoSummary[]): string {
  if (similar.length === 0) {
    return "暂无足够相似的历史视频；标题建议需主要依据标签与当前草稿内容改写。";
  }
  return similar
    .map((item, index) => {
      const completion =
        item.completionRate === null
          ? "完播未知"
          : `完播 ${(item.completionRate * 100).toFixed(1)}%`;
      const watch =
        item.averageWatchSeconds === null
          ? "观看未知"
          : `均看 ${item.averageWatchSeconds.toFixed(1)}s`;
      const views = item.views === null ? "播放未知" : `播放 ${item.views}`;
      const tags =
        item.matchedTags.length > 0
          ? `命中标签：${item.matchedTags.join("、")}`
          : "标题相似";
      return `${index + 1}. 「${item.description}」｜${completion}｜${watch}｜${views}｜相似度 ${item.similarityScore}｜${tags}`;
    })
    .join("\n");
}
