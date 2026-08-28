import type {
  HotspotItem,
  HotspotSourceConfig,
  TrackId,
} from "@video-diagnosis/shared-types";
import { HOTSPOT_MAX_ITEMS, type HotspotFeedEntry } from "@/lib/hotspots/types";
import { canonicalHotspotUrl, hotspotItemId } from "@/lib/hotspots/url-policy";
import { matchTracks, normalizeTrackText } from "@/lib/tracks/dictionary";

export interface HotspotSourceEntries {
  source: HotspotSourceConfig;
  entries: readonly HotspotFeedEntry[];
}

export interface HotspotRelevanceResult {
  items: HotspotItem[];
  /** itemId → 命中同一条内容的全部来源 id；跨源重复只留一条，热度仍按独立源计。 */
  sourceIdsByItem: Record<string, string[]>;
}

export interface HotspotRelevanceOptions {
  trackIds: readonly TrackId[];
  freshnessDays: number;
  now: Date;
  maxItems?: number;
}

interface Bucket {
  item: HotspotItem;
  timestamp: number;
  sourceIds: Set<string>;
}

export function selectRelevantHotspotItems(
  groups: readonly HotspotSourceEntries[],
  options: HotspotRelevanceOptions,
): HotspotRelevanceResult {
  const nowMs = options.now.getTime();
  const floor = nowMs - options.freshnessDays * 24 * 60 * 60 * 1000;
  const buckets = new Map<string, Bucket>();
  // urlKey 与标题归一化 key 都指向同一个 bucket，实现双重去重。
  const aliases = new Map<string, string>();

  for (const group of groups) {
    for (const entry of group.entries) {
      // 解析层已归一过，这里再归一一次保证任何调用方进来的地址都能跨源对齐。
      const canonicalUrl = canonicalHotspotUrl(entry.url);
      if (!canonicalUrl) continue;
      const matched = matchTracks(
        `${entry.title} ${entry.summary ?? ""}`,
        options.trackIds,
      );
      if (matched.trackIds.length === 0) continue;

      const parsed = entry.publishedAt ? Date.parse(entry.publishedAt) : Number.NaN;
      const hasDate = Number.isFinite(parsed);
      // 没有发布时间的源（不少热榜如此）按抓取时刻视为新鲜。
      if (hasDate && parsed < floor) continue;
      const timestamp = hasDate ? parsed : nowMs;

      const item: HotspotItem = {
        id: hotspotItemId(canonicalUrl),
        sourceId: group.source.id,
        sourceName: group.source.name,
        title: entry.title,
        url: canonicalUrl,
        ...(hasDate ? { publishedAt: new Date(parsed).toISOString() } : {}),
        ...(entry.summary ? { summary: entry.summary } : {}),
        trackIds: matched.trackIds,
        matchedTerms: matched.matchedTerms,
      };

      const urlKey = `u:${canonicalUrl}`;
      const titleKey = `t:${normalizeTrackText(entry.title)}`;
      const existingKey = aliases.get(urlKey) ?? aliases.get(titleKey);
      if (existingKey) {
        const bucket = buckets.get(existingKey);
        if (!bucket) continue;
        bucket.sourceIds.add(group.source.id);
        if (timestamp < bucket.timestamp) {
          bucket.item = item;
          bucket.timestamp = timestamp;
        }
        aliases.set(urlKey, existingKey);
        aliases.set(titleKey, existingKey);
        continue;
      }
      buckets.set(urlKey, {
        item,
        timestamp,
        sourceIds: new Set([group.source.id]),
      });
      aliases.set(urlKey, urlKey);
      aliases.set(titleKey, urlKey);
    }
  }

  const ordered = [...buckets.values()]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, options.maxItems ?? HOTSPOT_MAX_ITEMS);

  const sourceIdsByItem: Record<string, string[]> = {};
  for (const bucket of ordered) {
    sourceIdsByItem[bucket.item.id] = [...bucket.sourceIds];
  }
  return { items: ordered.map((bucket) => bucket.item), sourceIdsByItem };
}
