import type { HotspotSnapshot } from "@video-diagnosis/shared-types";
import { normalizeOwnerId } from "@/lib/data/owner";
import {
  createHotspotSnapshotId,
  hotspotConfigKey,
  isHotspotRefreshDue,
  readLatestHotspotSnapshot,
  writeHotspotSnapshot,
} from "@/lib/hotspots/cache";
import { clusterHotspotItems } from "@/lib/hotspots/cluster";
import { fetchHotspotSources } from "@/lib/hotspots/feed";
import { selectRelevantHotspotItems } from "@/lib/hotspots/relevance";
import {
  hasSkippedRsshubSources,
  resolveHotspotRuntimeConfig,
  resolveHotspotSources,
} from "@/lib/hotspots/sources";
import { generateHotspotTopicCards } from "@/lib/hotspots/topics";
import {
  HOTSPOT_CACHE_TTL_MS,
  HOTSPOT_MAX_CLUSTERS,
  HOTSPOT_MAX_ITEMS,
  HOTSPOT_MAX_LIMITATIONS,
  type HotspotRuntimeConfig,
  type HotspotServiceOptions,
  type HotspotServiceRequest,
  type HotspotServiceResult,
} from "@/lib/hotspots/types";
import { createHotspotUrlPolicy } from "@/lib/hotspots/url-policy";
import { clipResearchText } from "@/lib/viral-research/source-policy";

function emptySnapshot(
  ownerId: string,
  configKey: string,
  now: Date,
): HotspotSnapshot {
  const fetchedAt = now.toISOString();
  return {
    id: createHotspotSnapshotId(configKey, fetchedAt),
    ownerId,
    fetchedAt,
    expiresAt: new Date(now.getTime() + HOTSPOT_CACHE_TTL_MS).toISOString(),
    sourceReports: [],
    items: [],
    clusters: [],
    topicCards: [],
    limitations: [],
    degradedReason: null,
  };
}

function joinReasons(reasons: readonly string[]): string | null {
  const text = reasons.filter(Boolean).join("；");
  return text ? (clipResearchText(text, 500) ?? null) : null;
}

/**
 * 编排一次热点抓取。整体原则：单源失败不阻断，模型失败只丢选题卡，
 * 全部来源失败时优先把上一份快照还给用户而不是给空页面。
 */
export async function researchHotspots(
  ownerId: string,
  request: HotspotServiceRequest = {},
  options: HotspotServiceOptions = {},
): Promise<HotspotServiceResult> {
  const owner = normalizeOwnerId(ownerId);
  const config: HotspotRuntimeConfig = resolveHotspotRuntimeConfig(options.config);
  const now = options.now?.() ?? new Date();
  const configKey = hotspotConfigKey(config);
  const storageOptions = options.storageRoot
    ? { storageRoot: options.storageRoot }
    : {};

  const previous = await readLatestHotspotSnapshot(
    owner,
    configKey,
    storageOptions,
  ).catch(() => null);
  if (!request.forceRefresh && previous && !isHotspotRefreshDue(previous, now)) {
    return { snapshot: previous, cacheHit: true, stale: false };
  }

  if (!config.enabled) {
    return {
      snapshot: {
        ...emptySnapshot(owner, configKey, now),
        limitations: ["热点抓取当前是关闭状态，先在设置里打开。"],
        degradedReason: "热点抓取已在设置中关闭",
      },
      cacheHit: false,
      stale: false,
    };
  }

  const resolvedSources = resolveHotspotSources(config);
  const outcomes = await fetchHotspotSources(resolvedSources, {
    policy: createHotspotUrlPolicy(config.rsshubBaseUrl),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    maxItemsPerSource: config.maxItemsPerSource,
    now: () => options.now?.() ?? new Date(),
  });
  const sourceReports = outcomes.map((outcome) => outcome.report);
  const attempted = resolvedSources.filter((source) => source.requestUrl).length;
  const okCount = sourceReports.filter((report) => report.status === "ok").length;
  const failedCount = sourceReports.filter(
    (report) => report.status === "failed",
  ).length;

  if (attempted > 0 && okCount === 0) {
    const reason = `全部 ${attempted} 个来源抓取失败`;
    if (previous) {
      // 旧快照本身不可变，这里只在返回值上叠加提示，不回写磁盘。
      return {
        snapshot: {
          ...previous,
          limitations: [
            "这次所有来源都没抓到内容，显示的是上次的结果。",
            ...previous.limitations,
          ].slice(0, HOTSPOT_MAX_LIMITATIONS),
          degradedReason: joinReasons([
            reason,
            previous.degradedReason ?? "",
          ]),
        },
        cacheHit: false,
        stale: true,
      };
    }
    return {
      snapshot: {
        ...emptySnapshot(owner, configKey, now),
        sourceReports,
        limitations: ["这次所有来源都没抓到内容，稍后再试或在设置里检查来源。"],
        degradedReason: reason,
      },
      cacheHit: false,
      stale: false,
    };
  }

  const { items, sourceIdsByItem } = selectRelevantHotspotItems(
    outcomes.map((outcome, index) => ({
      source: resolvedSources[index]?.config ?? {
        id: outcome.report.sourceId,
        name: outcome.report.sourceName,
        url: "",
        kind: "rss" as const,
        enabled: true,
      },
      entries: outcome.entries,
    })),
    {
      trackIds: config.trackIds,
      customKeywords: config.customKeywords,
      freshnessDays: config.freshnessDays,
      now,
      maxItems: HOTSPOT_MAX_ITEMS,
    },
  );

  const clusters = clusterHotspotItems(items, {
    now,
    sourceIdsByItem,
    maxClusters: HOTSPOT_MAX_CLUSTERS,
  });

  const topics = await generateHotspotTopicCards({
    clusters,
    items,
    config,
    ...(options.llmImpl ? { llmImpl: options.llmImpl } : {}),
  });

  // 只留人话，按重要性取前两条；技术细节统一进 degradedReason。
  const limitations = [
    hasSkippedRsshubSources(resolvedSources)
      ? "还没填 RSSHub 地址，依赖 RSSHub 的来源这次没有抓取。"
      : "",
    failedCount > 0
      ? `有 ${failedCount} 个来源这次没抓到内容，其余来源正常。`
      : "",
    items.length === 0
      ? "这批来源里没有时效内的可用条目，可以放宽时效或增加来源。"
      : "",
    topics.limitation ?? "",
  ]
    .filter(Boolean)
    .slice(0, HOTSPOT_MAX_LIMITATIONS);

  const fetchedAt = now.toISOString();
  const snapshot: HotspotSnapshot = {
    id: createHotspotSnapshotId(configKey, fetchedAt),
    ownerId: owner,
    fetchedAt,
    expiresAt: new Date(now.getTime() + HOTSPOT_CACHE_TTL_MS).toISOString(),
    sourceReports,
    items,
    clusters,
    topicCards: topics.cards,
    limitations,
    degradedReason: joinReasons(topics.degradedReason ? [topics.degradedReason] : []),
  };

  try {
    return {
      snapshot: await writeHotspotSnapshot(snapshot, {
        ...storageOptions,
        configKey,
      }),
      cacheHit: false,
      stale: false,
    };
  } catch (error) {
    // 写盘失败不影响本次结果，只是下次不会命中缓存。
    return {
      snapshot: {
        ...snapshot,
        limitations: [
          "结果没能存到本地，下次打开会重新抓取。",
          ...limitations,
        ].slice(0, HOTSPOT_MAX_LIMITATIONS),
        degradedReason: joinReasons([
          topics.degradedReason ?? "",
          `快照写入失败：${error instanceof Error ? error.message : String(error)}`,
        ]),
      },
      cacheHit: false,
      stale: false,
    };
  }
}
