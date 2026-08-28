import type { HotspotSourceKind, TrackId } from "@video-diagnosis/shared-types";
import { DEFAULT_HOTSPOT_SOURCES } from "@/lib/hotspots/sources";
import {
  HOTSPOT_DEFAULT_FRESHNESS_DAYS,
  HOTSPOT_DEFAULT_MAX_ITEMS_PER_SOURCE,
  HOTSPOT_MAX_FRESHNESS_DAYS,
  HOTSPOT_MAX_ITEMS_PER_SOURCE,
  HOTSPOT_MIN_FRESHNESS_DAYS,
  HOTSPOT_MIN_ITEMS_PER_SOURCE,
} from "@/lib/hotspots/types";
import { normalizeRsshubBaseUrl } from "@/lib/settings/hotspot-config";
import type { HotspotSourceSetting } from "@/lib/settings/schema";

/** 与 schema 中 `sources` 的 `.max(30)` 对齐。 */
export const HOTSPOT_MAX_SOURCES = 30;

/** dashscope 兜底源由系统维护，用户只能启停，因此不进新增下拉。 */
export const EDITABLE_HOTSPOT_SOURCE_KINDS = [
  "rss",
  "atom",
  "json_feed",
  "rsshub",
] as const satisfies readonly HotspotSourceKind[];

export const HOTSPOT_SOURCE_KIND_LABELS: Record<HotspotSourceKind, string> = {
  rss: "RSS",
  atom: "Atom",
  json_feed: "JSON Feed",
  rsshub: "RSSHub 路由",
  dashscope: "百炼兜底",
};

export function hotspotSourceUrlHint(kind: HotspotSourceKind): string {
  if (kind === "rsshub") {
    return "填 RSSHub 路由（如 /weibo/search/hot），运行时与上方 RSSHub 地址拼接";
  }
  if (kind === "dashscope") {
    return "百炼联网兜底由系统维护，这里的地址不生效";
  }
  return "填完整订阅地址（http/https）";
}

export function hotspotSourceUrlPlaceholder(kind: HotspotSourceKind): string {
  if (kind === "rsshub") return "/weibo/search/hot";
  if (kind === "dashscope") return "search://recent-track-hotspots";
  return "https://example.com/feed";
}

export function restoreDefaultHotspotSources(): HotspotSourceSetting[] {
  return DEFAULT_HOTSPOT_SOURCES.map((source) => ({ ...source }));
}

/** `sources` 为空表示沿用内置清单，UI 仍需把内置清单展示出来。 */
export function resolveEditableHotspotSources(
  sources: readonly HotspotSourceSetting[],
): { sources: HotspotSourceSetting[]; usingDefaults: boolean } {
  if (sources.length === 0) {
    return { sources: restoreDefaultHotspotSources(), usingDefaults: true };
  }
  return {
    sources: sources.map((source) => ({ ...source })),
    usingDefaults: false,
  };
}

export function slugifyHotspotSourceId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return slug || "source";
}

/** 冲突时追加序号；id 最长 64，slug 已截到 48 留出后缀空间。 */
export function nextHotspotSourceId(
  name: string,
  existing: readonly { id: string }[],
): string {
  const base = slugifyHotspotSourceId(name);
  const taken = new Set(existing.map((source) => source.id));
  if (!taken.has(base)) return base;
  for (let index = 2; index <= HOTSPOT_MAX_SOURCES + 1; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export function canAddHotspotSource(
  sources: readonly HotspotSourceSetting[],
): boolean {
  return sources.length < HOTSPOT_MAX_SOURCES;
}

export function hotspotSourceLimitHint(
  sources: readonly HotspotSourceSetting[],
): string | null {
  return canAddHotspotSource(sources)
    ? null
    : `最多 ${HOTSPOT_MAX_SOURCES} 条热点源，删除后才能继续新增`;
}

export interface HotspotSourceDraft {
  name?: string;
  url?: string;
  kind?: HotspotSourceKind;
}

export function addHotspotSource(
  sources: readonly HotspotSourceSetting[],
  draft: HotspotSourceDraft = {},
): HotspotSourceSetting[] {
  const list = sources.map((source) => ({ ...source }));
  if (!canAddHotspotSource(list)) return list;
  const kind = draft.kind ?? "rss";
  const name = draft.name?.trim() || `新热点源 ${list.length + 1}`;
  return [
    ...list,
    {
      id: nextHotspotSourceId(name, list),
      name,
      url: draft.url?.trim() ?? "",
      kind,
      enabled: true,
    },
  ];
}

export function removeHotspotSource(
  sources: readonly HotspotSourceSetting[],
  id: string,
): HotspotSourceSetting[] {
  return sources
    .filter((source) => source.id !== id)
    .map((source) => ({ ...source }));
}

export function updateHotspotSource(
  sources: readonly HotspotSourceSetting[],
  id: string,
  patch: Partial<Omit<HotspotSourceSetting, "id">>,
): HotspotSourceSetting[] {
  return sources.map((source) =>
    source.id === id ? { ...source, ...patch } : { ...source },
  );
}

/** 名称或地址为空的行会在保存归一化时被丢弃，提前提示用户。 */
export function incompleteHotspotSourceNames(
  sources: readonly HotspotSourceSetting[],
): string[] {
  return sources
    .filter((source) => !source.name.trim() || !source.url.trim())
    .map((source) => source.name.trim() || source.id);
}

export function toggleHotspotTrackId(
  trackIds: readonly TrackId[],
  id: TrackId,
  checked: boolean,
): TrackId[] {
  if (checked) {
    return trackIds.includes(id) ? [...trackIds] : [...trackIds, id];
  }
  return trackIds.filter((trackId) => trackId !== id);
}

export function rsshubBaseUrlHint(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "留空则跳过所有 RSSHub 源";
  return normalizeRsshubBaseUrl(raw)
    ? null
    : "地址无效，需形如 http://127.0.0.1:1200";
}

export interface HotspotNumberRange {
  min: number;
  max: number;
  fallback: number;
}

export const HOTSPOT_FRESHNESS_RANGE: HotspotNumberRange = {
  min: HOTSPOT_MIN_FRESHNESS_DAYS,
  max: HOTSPOT_MAX_FRESHNESS_DAYS,
  fallback: HOTSPOT_DEFAULT_FRESHNESS_DAYS,
};

export const HOTSPOT_ITEMS_PER_SOURCE_RANGE: HotspotNumberRange = {
  min: HOTSPOT_MIN_ITEMS_PER_SOURCE,
  max: HOTSPOT_MAX_ITEMS_PER_SOURCE,
  fallback: HOTSPOT_DEFAULT_MAX_ITEMS_PER_SOURCE,
};

/** 输入框保留用户原始文本，提交给 settings 的值必须先钳制到合法区间。 */
export function commitNumberDraft(
  draft: string,
  range: HotspotNumberRange,
): number {
  const raw = draft.trim();
  if (!/^-?\d+$/u.test(raw)) return range.fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return range.fallback;
  return Math.min(range.max, Math.max(range.min, parsed));
}

export function numberDraftHint(
  draft: string,
  range: HotspotNumberRange,
): string | null {
  const raw = draft.trim();
  if (!raw) return `留空按 ${range.fallback} 处理`;
  if (!/^\d+$/u.test(raw)) return `请填 ${range.min}–${range.max} 的整数`;
  const parsed = Number.parseInt(raw, 10);
  if (parsed < range.min || parsed > range.max) {
    return `超出 ${range.min}–${range.max}，已按 ${commitNumberDraft(raw, range)} 记录`;
  }
  return null;
}
