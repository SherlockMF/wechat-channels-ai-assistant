import type {
  HotspotSnapshot,
  HotspotSourceConfig,
  HotspotSourceReport,
  TrackId,
} from "@video-diagnosis/shared-types";

/** 历史快照在八小时内仍可用于创作引用。刷新榜单的间隔另行计算。 */
export const HOTSPOT_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
export const HOTSPOT_REFRESH_INTERVAL_MS = 20 * 60 * 1000;
export const HOTSPOT_FETCH_CONCURRENCY = 4;
export const HOTSPOT_SOURCE_TIMEOUT_MS = 8_000;
export const HOTSPOT_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
/** 整体抓取预算；超出后未开始的源直接按失败记账，保证接口不被单源拖死。 */
export const HOTSPOT_FETCH_BUDGET_MS = 20_000;
export const HOTSPOT_SNAPSHOT_RETENTION = 30;
export const HOTSPOT_MAX_ITEMS = 120;
export const HOTSPOT_MAX_CLUSTERS = HOTSPOT_MAX_ITEMS;
export const HOTSPOT_MAX_TOPIC_CARDS = 12;
export const HOTSPOT_MAX_CARDS_PER_CLUSTER = 2;
/** 免责说明只留人话，技术原因一律进 degradedReason。 */
export const HOTSPOT_MAX_LIMITATIONS = 2;
export const HOTSPOT_DEFAULT_FRESHNESS_DAYS = 7;
export const HOTSPOT_DEFAULT_MAX_ITEMS_PER_SOURCE = 20;
export const HOTSPOT_MIN_FRESHNESS_DAYS = 1;
export const HOTSPOT_MAX_FRESHNESS_DAYS = 30;
export const HOTSPOT_MIN_ITEMS_PER_SOURCE = 5;
export const HOTSPOT_MAX_ITEMS_PER_SOURCE = 50;
export const HOTSPOT_CLUSTER_SIMILARITY_THRESHOLD = 0.45;
export const HOTSPOT_CLUSTER_TIME_WINDOW_MS = 72 * 60 * 60 * 1000;
/** 允许源站时钟有少量偏差，超过 6 小时的未来时间视为脏数据。 */
export const HOTSPOT_FUTURE_TOLERANCE_MS = 6 * 60 * 60 * 1000;
export const HOTSPOT_MAX_REDIRECTS = 5;
export const HOTSPOT_LLM_TIMEOUT_MS = 45_000;
/** 全部已限量的候选参与语义匹配，不能只按关键词/热度提前截取八簇。 */
export const HOTSPOT_TOPIC_CLUSTER_LIMIT = HOTSPOT_MAX_CLUSTERS;

export interface HotspotLlmConfig {
  enabled: boolean;
  /** 三项留空表示调用时再按全局百炼设置解析，避免模块加载期读磁盘。 */
  apiKey: string;
  apiBaseUrl: string;
  model: string;
}

export interface HotspotRuntimeConfig {
  enabled: boolean;
  /** 为空则跳过全部 rsshub 类型源；只有它允许 http 与内网地址。 */
  rsshubBaseUrl: string;
  freshnessDays: number;
  maxItemsPerSource: number;
  trackIds: TrackId[];
  customKeywords: string[];
  /** 只作为选题模型的不可信用户上下文，不参与 system 指令。 */
  accountPositioning: string;
  sources: HotspotSourceConfig[];
  llm: HotspotLlmConfig;
}

/** 主题词保持用户写法，但用 NFKC + 忽略大小写的 key 稳定去重。 */
export function normalizeHotspotKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const keyword = candidate.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!keyword || keyword.length > 40) continue;
    const key = keyword.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= 80) break;
  }
  return result;
}

/** 设置页尚未提供 providers.hotspots，调用方按需覆盖，其余走内置默认值。 */
export type HotspotRuntimeConfigOverride = Partial<
  Omit<HotspotRuntimeConfig, "llm">
> & { llm?: Partial<HotspotLlmConfig> };

export interface HotspotLlmInput {
  system: string;
  user: string;
  signal?: AbortSignal;
}

export type HotspotLlmImpl = (input: HotspotLlmInput) => Promise<string>;

export interface HotspotServiceOptions {
  config?: HotspotRuntimeConfigOverride;
  fetchImpl?: typeof fetch;
  storageRoot?: string;
  now?: () => Date;
  llmImpl?: HotspotLlmImpl;
}

export interface HotspotServiceRequest {
  forceRefresh?: boolean;
}

export interface HotspotServiceResult {
  snapshot: HotspotSnapshot;
  cacheHit: boolean;
  /** 返回的是过期或上一轮的旧快照。 */
  stale: boolean;
}

export interface HotspotFeedEntry {
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
}

export interface ResolvedHotspotSource {
  config: HotspotSourceConfig;
  /** 可抓取时的最终请求地址；与 skipReason 互斥。 */
  requestUrl?: string;
  skipReason?: string;
}

export interface HotspotSourceFetchOutcome {
  report: HotspotSourceReport;
  entries: HotspotFeedEntry[];
}
