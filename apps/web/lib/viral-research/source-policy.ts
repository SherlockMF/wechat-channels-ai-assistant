import { createHash } from "node:crypto";
import {
  expandTrackTerms,
  matchTracks,
  normalizeTrackText,
  trackLabel,
} from "@/lib/tracks/dictionary";
import type {
  ViralResearchItem,
  ViralResearchQuery,
} from "@/lib/viral-research/types";

const TRACKING_PARAMETERS = new Set([
  "from",
  "share_app_name",
  "share_iid",
  "share_link_id",
  "share_token",
  "source",
  "spm",
]);

const GENERIC_RESEARCH_TERMS = new Set([
  "一个",
  "一些",
  "内容",
  "分享",
  "原创",
  "参考",
  "展示",
  "怎么",
  "想做",
  "我们",
  "案例",
  "种草",
  "视频",
  "话题",
  "选题",
]);

export function clipResearchText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/gu, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

export function sanitizeResearchUrl(value: unknown): string | undefined {
  const raw = clipResearchText(value, 8_192);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lowered = key.toLowerCase();
      if (lowered.startsWith("utm_") || TRACKING_PARAMETERS.has(lowered)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    let sanitized = url.toString();
    if (sanitized.length > 2_048) {
      url.search = "";
      sanitized = url.toString();
    }
    return sanitized.length <= 2_048 ? sanitized : undefined;
  } catch {
    return undefined;
  }
}

export function stableResearchItemId(
  sourceType: ViralResearchItem["sourceType"],
  identity: string,
): string {
  return `${sourceType}-${createHash("sha256")
    .update(`${sourceType}:${identity}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function normalizedResearchText(value: string): string {
  return normalizeTrackText(value);
}

function queryTerms(query: ViralResearchQuery): string[] {
  const topic = query.topic.toLowerCase();
  const terms = new Set<string>();
  for (const rawPart of topic.split(/[\s:：,，。；;、|/\\()（）]+/u)) {
    const part = normalizedResearchText(rawPart);
    if (part.length < 2 || GENERIC_RESEARCH_TERMS.has(part)) continue;
    if (part.length <= 16) terms.add(part);
    for (let index = 0; index < part.length - 1; index += 1) {
      const bigram = part.slice(index, index + 2);
      if (!GENERIC_RESEARCH_TERMS.has(bigram)) terms.add(bigram);
    }
  }
  for (const term of expandTrackTerms(query.topic, 32)) {
    terms.add(normalizedResearchText(term));
  }
  return [...terms].filter(Boolean);
}

const VIDEO_PLATFORM_URL_PATTERN =
  /(?:douyin\.com|iesdouyin\.com|xiaohongshu\.com|xhslink\.com|bilibili\.com|b23\.tv|kuaishou\.com|weixin\.qq\.com|channels\.weixin\.qq\.com)/iu;

export function isPreferredVideoPlatformUrl(url: string | undefined): boolean {
  if (!url) return false;
  return VIDEO_PLATFORM_URL_PATTERN.test(url);
}

/** 模型对单条来源的打标；缺席时才回落到赛道词典。 */
export interface ResearchRelevanceJudgement {
  relevant: boolean;
  kind: "platform_page" | "media_article" | "generic_page";
  reason?: string;
}

/**
 * 百炼 search_results 只有 index/title/url，摘要与站点恒为空，
 * 因此宽松匹配只看标题：命中主题词或同赛道关键词即视为相关。
 */
function dictionaryRelevance(
  query: ViralResearchQuery,
  item: ViralResearchItem,
): string | undefined {
  const haystack = normalizedResearchText(item.title);
  if (!haystack) return undefined;
  const matched = queryTerms(query).filter((term) => haystack.includes(term));
  if (matched.length) {
    return `标题命中本次主题关键词：${matched.slice(0, 3).join("、")}`;
  }
  const topicTracks = new Set(matchTracks(query.topic).trackIds);
  if (!topicTracks.size) return undefined;
  const itemMatch = matchTracks(item.title);
  const sharedTrack = itemMatch.trackIds.find((id) => topicTracks.has(id));
  if (!sharedTrack) return undefined;
  return `标题命中「${trackLabel(sharedTrack)}」赛道关键词：${itemMatch.matchedTerms
    .slice(0, 3)
    .join("、")}`;
}

export function isResearchItemRelevant(
  query: ViralResearchQuery,
  item: ViralResearchItem,
): boolean {
  if (item.sourceType === "owned_history" || item.sourceType === "viral_sample") {
    return true;
  }
  return dictionaryRelevance(query, item) !== undefined;
}

export function filterResearchItemsByQuery(
  query: ViralResearchQuery,
  candidates: ViralResearchItem[],
  judgements: ReadonlyMap<string, ResearchRelevanceJudgement> = new Map(),
): ViralResearchItem[] {
  return candidates.flatMap((item) => {
    if (item.sourceType === "owned_history" || item.sourceType === "viral_sample") {
      return [item];
    }
    const judgement = judgements.get(item.id);
    if (judgement) {
      if (!judgement.relevant) return [];
      const reason =
        clipResearchText(judgement.reason, 160) ??
        dictionaryRelevance(query, item) ??
        "模型判定与本次研究主题相关";
      return [{ ...item, relevanceReasons: [reason] }];
    }
    const reason = dictionaryRelevance(query, item);
    if (!reason) return [];
    return [{ ...item, relevanceReasons: [reason] }];
  });
}

function itemDedupeKey(item: ViralResearchItem): string {
  if (item.url) return `url:${item.url.toLowerCase()}`;
  return `text:${item.sourceType}:${item.site ?? ""}:${item.title}`.toLowerCase();
}

function authorKey(item: ViralResearchItem): string | undefined {
  return clipResearchText(item.author, 80)?.toLowerCase();
}

/** Apply the source safety contract after all adapters have been merged. */
export function enforceResearchItemPolicy(
  candidates: ViralResearchItem[],
  limit = 10,
): ViralResearchItem[] {
  const seen = new Set<string>();
  const authorCounts = new Map<string, number>();
  const accepted: ViralResearchItem[] = [];

  for (const candidate of candidates) {
    const url = candidate.url
      ? sanitizeResearchUrl(candidate.url)
      : undefined;
    if (candidate.sourceType !== "owned_history" && !url) continue;
    const title = clipResearchText(candidate.title, 180);
    if (!title) continue;
    const item: ViralResearchItem = {
      ...candidate,
      title,
      ...(url ? { url } : { url: undefined }),
      ...(clipResearchText(candidate.site, 80)
        ? { site: clipResearchText(candidate.site, 80) }
        : { site: undefined }),
      ...(clipResearchText(candidate.author, 80)
        ? { author: clipResearchText(candidate.author, 80) }
        : { author: undefined }),
      ...(clipResearchText(candidate.publishedAt, 64)
        ? { publishedAt: clipResearchText(candidate.publishedAt, 64) }
        : { publishedAt: undefined }),
      ...(clipResearchText(candidate.snippet, 500)
        ? { snippet: clipResearchText(candidate.snippet, 500) }
        : { snippet: undefined }),
      relevanceReasons: candidate.relevanceReasons
        .map((reason) => clipResearchText(reason, 160))
        .filter((reason): reason is string => Boolean(reason))
        .slice(0, 4),
      ...(clipResearchText(candidate.trendSignal, 200)
        ? { trendSignal: clipResearchText(candidate.trendSignal, 200) }
        : { trendSignal: undefined }),
    };
    const dedupeKey = itemDedupeKey(item);
    if (seen.has(dedupeKey)) continue;
    const byAuthor = authorKey(item);
    if (byAuthor && (authorCounts.get(byAuthor) ?? 0) >= 2) continue;

    seen.add(dedupeKey);
    if (byAuthor) authorCounts.set(byAuthor, (authorCounts.get(byAuthor) ?? 0) + 1);
    accepted.push(item);
    if (accepted.length >= limit) break;
  }
  return accepted;
}
