import type {
  HotspotSnapshot,
  HotspotSourceConfig,
  HotspotSourceReport,
  TrackId,
} from "@video-diagnosis/shared-types";

/** 热点快照有效期：热榜半天内变化有限，8 小时足够覆盖一天两次刷新。 */
export const HOTSPOT_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
export const HOTSPOT_FETCH_CONCURRENCY = 4;
export const HOTSPOT_SOURCE_TIMEOUT_MS = 8_000;
export const HOTSPOT_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
/** 整体抓取预算；超出后未开始的源直接按失败记账，保证接口不被单源拖死。 */
export const HOTSPOT_FETCH_BUDGET_MS = 20_000;
export const HOTSPOT_SNAPSHOT_RETENTION = 30;
export const HOTSPOT_MAX_ITEMS = 120;
export const HOTSPOT_MAX_CLUSTERS = 20;
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
export const HOTSPOT_LLM_TIMEOUT_MS = 45_000;
/** 送进选题模型的簇上限，控制 prompt 体积与成本。 */
export const HOTSPOT_TOPIC_CLUSTER_LIMIT = 8;

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
  sources: HotspotSourceConfig[];
  llm: HotspotLlmConfig;
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
