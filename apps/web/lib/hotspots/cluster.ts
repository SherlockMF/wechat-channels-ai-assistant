import { createHash } from "node:crypto";
import type { HotspotCluster, HotspotItem, TrackId } from "@video-diagnosis/shared-types";
import {
  HOTSPOT_CLUSTER_SIMILARITY_THRESHOLD,
  HOTSPOT_CLUSTER_TIME_WINDOW_MS,
  HOTSPOT_MAX_CLUSTERS,
} from "@/lib/hotspots/types";
import { normalizeTrackText } from "@/lib/tracks/dictionary";

export interface HotspotClusterOptions {
  now: Date;
  sourceIdsByItem?: Record<string, string[]>;
  maxClusters?: number;
}

interface Member {
  item: HotspotItem;
  timestamp: number;
  bigrams: Set<string>;
  normalizedTitle: string;
}

function bigramSet(normalized: string): Set<string> {
  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

/** 集合版 Dice 系数：重复 bigram 不重复计数，对中文短标题足够稳。 */
function diceSimilarity(left: Member, right: Member): number {
  if (left.normalizedTitle && left.normalizedTitle === right.normalizedTitle) {
    return 1;
  }
  const total = left.bigrams.size + right.bigrams.size;
  if (total === 0) return 0;
  let shared = 0;
  for (const gram of left.bigrams) {
    if (right.bigrams.has(gram)) shared += 1;
  }
  return (2 * shared) / total;
}

function recencyScore(
  latestMs: number,
  nowMs: number,
  hasKnownDate: boolean,
): number {
  if (!hasKnownDate) return 1;
  const ageMs = nowMs - latestMs;
  if (ageMs <= 24 * 60 * 60 * 1000) return 3;
  if (ageMs <= HOTSPOT_CLUSTER_TIME_WINDOW_MS) return 1;
  return 0;
}

function clusterId(itemIds: readonly string[]): string {
  const digest = createHash("sha256")
    .update([...itemIds].sort().join("|"))
    .digest("hex");
  return `hc-${digest.slice(0, 16)}`;
}

/**
 * 同事件聚类：标题归一化后 bigram Dice ≥0.45 且时间差 ≤72h 视为同一事件。
 * 贪心单遍分配：既要与簇内成员相似，也要与该簇首个代表标题相似，
 * 避免 A≈B、B≈C、A≉C 时由 B 把两个事件串成一个簇。
 */
export function clusterHotspotItems(
  items: readonly HotspotItem[],
  options: HotspotClusterOptions,
): HotspotCluster[] {
  const nowMs = options.now.getTime();
  const sourceIdsByItem = options.sourceIdsByItem ?? {};
  const members: Member[] = items.map((item) => {
    const parsed = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
    const normalizedTitle = normalizeTrackText(item.title);
    return {
      item,
      timestamp: Number.isFinite(parsed) ? parsed : nowMs,
      bigrams: bigramSet(normalizedTitle),
      normalizedTitle,
    };
  });
  members.sort((left, right) => left.timestamp - right.timestamp);

  const groups: Member[][] = [];
  for (const member of members) {
    const target = groups.find((group) => {
      const representative = group[0];
      if (!representative) return false;
      const matchesRepresentative =
        Math.abs(representative.timestamp - member.timestamp) <=
          HOTSPOT_CLUSTER_TIME_WINDOW_MS &&
        diceSimilarity(representative, member) >=
          HOTSPOT_CLUSTER_SIMILARITY_THRESHOLD;
      return (
        matchesRepresentative &&
        group.some(
          (existing) =>
            Math.abs(existing.timestamp - member.timestamp) <=
              HOTSPOT_CLUSTER_TIME_WINDOW_MS &&
            diceSimilarity(existing, member) >=
              HOTSPOT_CLUSTER_SIMILARITY_THRESHOLD,
        )
      );
    });
    if (target) target.push(member);
    else groups.push([member]);
  }

  const clusters = groups.map((group) => {
    const sourceIds = new Set<string>();
    const trackIds: TrackId[] = [];
    for (const member of group) {
      const owners = sourceIdsByItem[member.item.id] ?? [member.item.sourceId];
      owners.forEach((id) => sourceIds.add(id));
      for (const trackId of member.item.trackIds) {
        if (!trackIds.includes(trackId)) trackIds.push(trackId);
      }
    }
    // headline 取命中来源最多的标题，同分时取最早出现的，保证结果可复现。
    const headlineMember = [...group].sort((left, right) => {
      const leftSources = (sourceIdsByItem[left.item.id] ?? [left.item.sourceId]).length;
      const rightSources = (sourceIdsByItem[right.item.id] ?? [right.item.sourceId]).length;
      if (leftSources !== rightSources) return rightSources - leftSources;
      return left.timestamp - right.timestamp;
    })[0];
    const timestamps = group.map((member) => member.timestamp);
    const firstSeenMs = Math.min(...timestamps);
    const latestMs = Math.max(...timestamps);
    const datedTimestamps = group.flatMap((member) =>
      member.item.publishedAt ? [member.timestamp] : [],
    );
    const dateConfidence = datedTimestamps.length / group.length;
    const recency = recencyScore(
      datedTimestamps.length ? Math.max(...datedTimestamps) : latestMs,
      nowMs,
      datedTimestamps.length > 0,
    );
    const scoreBreakdown = {
      sourceDiversity: sourceIds.size * 3,
      itemVolume: group.length,
      recency,
      dateConfidence,
    };
    const heat = Object.values(scoreBreakdown).reduce(
      (total, value) => total + value,
      0,
    );
    const confidence =
      dateConfidence >= 0.75 && sourceIds.size >= 2
        ? "high"
        : dateConfidence > 0 && (sourceIds.size >= 2 || heat >= 7)
          ? "medium"
          : "low";
    const itemIds = group.map((member) => member.item.id);
    return {
      id: clusterId(itemIds),
      headline: headlineMember?.item.title ?? group[0]?.item.title ?? "",
      itemIds,
      sourceCount: sourceIds.size,
      firstSeenAt: new Date(firstSeenMs).toISOString(),
      latestAt: new Date(latestMs).toISOString(),
      heat,
      scoreBreakdown,
      confidence,
      trackIds,
    } satisfies HotspotCluster;
  });

  clusters.sort((left, right) => {
    if (right.heat !== left.heat) return right.heat - left.heat;
    return Date.parse(right.latestAt) - Date.parse(left.latestAt);
  });
  return clusters.slice(0, options.maxClusters ?? HOTSPOT_MAX_CLUSTERS);
}
