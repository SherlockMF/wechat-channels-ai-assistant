import {
  hotspotSourceConfigSchema,
  trackIdSchema,
  type HotspotSourceConfig,
  type TrackId,
} from "@video-diagnosis/shared-types";
import {
  HOTSPOT_DEFAULT_FRESHNESS_DAYS,
  HOTSPOT_DEFAULT_MAX_ITEMS_PER_SOURCE,
  HOTSPOT_MAX_FRESHNESS_DAYS,
  HOTSPOT_MAX_ITEMS_PER_SOURCE,
  HOTSPOT_MIN_FRESHNESS_DAYS,
  HOTSPOT_MIN_ITEMS_PER_SOURCE,
  type HotspotRuntimeConfig,
  type HotspotRuntimeConfigOverride,
  type ResolvedHotspotSource,
  normalizeHotspotKeywords,
} from "@/lib/hotspots/types";
import { allTrackIds } from "@/lib/tracks/dictionary";

/** 内置默认源只保留实测可用项；站点改版后仍会由 sourceReports 单独报错。 */
export const DEFAULT_HOTSPOT_SOURCES: readonly HotspotSourceConfig[] = [
  {
    id: "ithome",
    name: "IT之家",
    url: "https://www.ithome.com/rss/",
    kind: "rss",
    enabled: true,
  },
  {
    id: "36kr",
    name: "36氪快讯（RSSHub）",
    url: "/36kr/newsflashes",
    kind: "rsshub",
    enabled: true,
  },
  {
    id: "geekpark",
    name: "极客公园",
    url: "https://www.geekpark.net/rss",
    kind: "rss",
    enabled: true,
  },
  {
    id: "sspai",
    name: "少数派",
    url: "https://sspai.com/feed",
    kind: "rss",
    enabled: true,
  },
  {
    id: "rsshub-weibo-hot",
    name: "微博热搜（TopHub）",
    url: "/tophub/WnBe01o371",
    kind: "rsshub",
    enabled: true,
  },
  {
    id: "rsshub-zhihu-hot",
    name: "知乎热榜（RSSHub）",
    url: "/zhihu/hot",
    kind: "rsshub",
    enabled: true,
  },
  {
    id: "rsshub-douyin-hot",
    name: "抖音总榜（TopHub）",
    url: "/tophub/Y2KeDGQdNP",
    kind: "rsshub",
    enabled: true,
  },
] as const;

export function defaultHotspotRuntimeConfig(): HotspotRuntimeConfig {
  return {
    enabled: true,
    rsshubBaseUrl: "",
    freshnessDays: HOTSPOT_DEFAULT_FRESHNESS_DAYS,
    maxItemsPerSource: HOTSPOT_DEFAULT_MAX_ITEMS_PER_SOURCE,
    trackIds: allTrackIds(),
    customKeywords: [],
    accountPositioning: "",
    sources: DEFAULT_HOTSPOT_SOURCES.map((source) => ({ ...source })),
    llm: { enabled: true, apiKey: "", apiBaseUrl: "", model: "" },
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeTrackIds(value: unknown, allowEmpty = false): TrackId[] {
  if (!Array.isArray(value)) return allTrackIds();
  const accepted: TrackId[] = [];
  for (const candidate of value) {
    const parsed = trackIdSchema.safeParse(candidate);
    if (parsed.success && !accepted.includes(parsed.data)) {
      accepted.push(parsed.data);
    }
  }
  return accepted.length ? accepted : allowEmpty ? [] : allTrackIds();
}

/** 用户配置为空则整体回落到内置清单；重复 id 只保留第一条。 */
export function mergeHotspotSources(
  value: unknown,
): HotspotSourceConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_HOTSPOT_SOURCES.map((source) => ({ ...source }));
  }
  const seen = new Set<string>();
  const merged: HotspotSourceConfig[] = [];
  for (const candidate of value) {
    const parsed = hotspotSourceConfigSchema.safeParse(candidate);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    merged.push(parsed.data);
  }
  return merged.length
    ? merged
    : DEFAULT_HOTSPOT_SOURCES.map((source) => ({ ...source }));
}

export function resolveHotspotRuntimeConfig(
  override?: HotspotRuntimeConfigOverride,
): HotspotRuntimeConfig {
  const base = defaultHotspotRuntimeConfig();
  if (!override) return base;
  const customKeywords = normalizeHotspotKeywords(override.customKeywords);
  return {
    enabled: override.enabled ?? base.enabled,
    rsshubBaseUrl: override.rsshubBaseUrl?.trim() ?? base.rsshubBaseUrl,
    freshnessDays: clampInteger(
      override.freshnessDays,
      HOTSPOT_MIN_FRESHNESS_DAYS,
      HOTSPOT_MAX_FRESHNESS_DAYS,
      base.freshnessDays,
    ),
    maxItemsPerSource: clampInteger(
      override.maxItemsPerSource,
      HOTSPOT_MIN_ITEMS_PER_SOURCE,
      HOTSPOT_MAX_ITEMS_PER_SOURCE,
      base.maxItemsPerSource,
    ),
    trackIds: override.trackIds
      ? normalizeTrackIds(override.trackIds, customKeywords.length > 0)
      : base.trackIds,
    customKeywords,
    accountPositioning:
      typeof override.accountPositioning === "string"
        ? override.accountPositioning.trim().slice(0, 300)
        : base.accountPositioning,
    sources: override.sources ? mergeHotspotSources(override.sources) : base.sources,
    llm: { ...base.llm, ...override.llm },
  };
}

function rsshubRequestUrl(baseUrl: string, route: string): string | undefined {
  const base = baseUrl.trim().replace(/\/+$/u, "");
  if (!base) return undefined;
  try {
    new URL(base);
  } catch {
    return undefined;
  }
  return `${base}/${route.trim().replace(/^\/+/u, "")}`;
}

/** 把配置展开成可执行的抓取计划；跳过原因在这里定死，抓取层不再判断。 */
export function resolveHotspotSources(
  config: HotspotRuntimeConfig,
): ResolvedHotspotSource[] {
  return config.sources.map((source) => {
    if (!source.enabled) {
      return { config: source, skipReason: "已在设置中停用" };
    }
    if (source.kind === "dashscope") {
      return { config: source, skipReason: "百炼联网兜底尚未接入" };
    }
    if (source.kind === "rsshub") {
      const requestUrl = rsshubRequestUrl(config.rsshubBaseUrl, source.url);
      return requestUrl
        ? { config: source, requestUrl }
        : { config: source, skipReason: "未配置 RSSHub 地址" };
    }
    return { config: source, requestUrl: source.url.trim() };
  });
}

export function hasSkippedRsshubSources(
  resolved: readonly ResolvedHotspotSource[],
): boolean {
  return resolved.some(
    (source) =>
      source.config.kind === "rsshub" &&
      source.skipReason === "未配置 RSSHub 地址",
  );
}
