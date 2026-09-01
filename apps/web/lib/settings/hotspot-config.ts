import { hotspotSourceConfigSchema } from "@video-diagnosis/shared-types";
import {
  normalizeHotspotKeywords,
  type HotspotRuntimeConfigOverride,
} from "@/lib/hotspots/types";
import type { HotspotsProviderSettings, UserSettings } from "@/lib/settings/schema";
import { normalizeContentProfile } from "@/lib/settings/content-profile";
import { allTrackIds, trackLabel } from "@/lib/tracks/dictionary";

/** RSSHub 通常自建在本机或内网，因此这里允许 http 与自定义端口。 */
export function normalizeRsshubBaseUrl(value: string): string {
  const raw = value.trim().replace(/\/+$/u, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/u, "");
  } catch {
    return "";
  }
}

export function normalizeHotspotBlock(
  hotspots: HotspotsProviderSettings,
): HotspotsProviderSettings {
  const customKeywords = normalizeHotspotKeywords(hotspots.customKeywords);
  const seenIds = new Set<string>();
  const sources = hotspots.sources.flatMap((source) => {
    const parsed = hotspotSourceConfigSchema.safeParse({
      ...source,
      name: source.name.trim(),
      url: source.url.trim(),
    });
    if (!parsed.success || seenIds.has(parsed.data.id)) return [];
    seenIds.add(parsed.data.id);
    return [parsed.data];
  });
  return {
    ...hotspots,
    rsshubBaseUrl: normalizeRsshubBaseUrl(hotspots.rsshubBaseUrl),
    trackIds: hotspots.trackIds.length
      ? [...new Set(hotspots.trackIds)]
      : customKeywords.length
        ? []
        : allTrackIds(),
    customKeywords,
    sources,
    topicModel: hotspots.topicModel.trim(),
  };
}

/** 设置块 → 热点服务的配置覆盖；留空字段由服务侧回落到内置默认。 */
export function hotspotConfigFromSettings(
  settings: UserSettings,
): HotspotRuntimeConfigOverride {
  const hotspots = normalizeHotspotBlock(settings.providers.hotspots);
  const profile = normalizeContentProfile(settings.contentProfile);
  const customKeywords = normalizeHotspotKeywords([
    ...profile.themeKeywords,
    ...hotspots.customKeywords,
  ]);
  const accountPositioning = [
    `账号：${profile.accountName}`,
    `品牌：${profile.brandName}`,
    `地域：${profile.region}`,
    `定位：${profile.positioning}`,
    profile.audiences.length ? `受众：${profile.audiences.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("；")
    .slice(0, 300);
  return {
    enabled: hotspots.enabled,
    rsshubBaseUrl: hotspots.rsshubBaseUrl,
    freshnessDays: hotspots.freshnessDays,
    maxItemsPerSource: hotspots.maxItemsPerSource,
    trackIds: hotspots.trackIds,
    customKeywords,
    accountPositioning,
    ...(hotspots.sources.length ? { sources: hotspots.sources } : {}),
    llm: {
      enabled: true,
      apiKey: "",
      apiBaseUrl: "",
      model: hotspots.topicModel,
    },
  };
}

export function hotspotConfigIssues(settings: UserSettings): string[] {
  const hotspots = normalizeHotspotBlock(settings.providers.hotspots);
  if (!hotspots.enabled) return ["热点研究未启用"];

  const issues: string[] = [];
  const rawRsshub = settings.providers.hotspots.rsshubBaseUrl.trim();
  if (rawRsshub && !hotspots.rsshubBaseUrl) {
    issues.push("RSSHub 地址无效，必须是 http(s) 地址");
  }
  const enabledSources = hotspots.sources.filter((source) => source.enabled);
  const hasConfiguredSources = hotspots.sources.length > 0;
  if (hasConfiguredSources && enabledSources.length === 0) {
    issues.push("所有热点源都已停用");
  }
  const needsRsshub = enabledSources.some((source) => source.kind === "rsshub");
  if (needsRsshub && !hotspots.rsshubBaseUrl) {
    issues.push("启用了 RSSHub 源但未填写 RSSHub 地址，这些源会被跳过");
  }
  if (!hotspots.trackIds.length && !hotspots.customKeywords.length) {
    issues.push("未选择任何赛道");
  }
  return issues;
}

export function describeHotspotConfig(settings: UserSettings): string {
  const hotspots = normalizeHotspotBlock(settings.providers.hotspots);
  if (!hotspots.enabled) return "未启用热点研究";
  const issues = hotspotConfigIssues(settings);
  if (issues.length > 0) return issues.join("；");
  const sourceCount = hotspots.sources.length || "内置默认";
  const tracks = hotspots.trackIds.length
    ? hotspots.trackIds.map((id) => trackLabel(id)).join("、")
    : "仅自定义主题";
  const custom = hotspots.customKeywords.length
    ? `；主题词：${hotspots.customKeywords.slice(0, 4).join("、")}`
    : "";
  return `已就绪（源 ${sourceCount}；近 ${hotspots.freshnessDays} 天；赛道：${tracks}${custom}${
    hotspots.rsshubBaseUrl ? "；已配置 RSSHub" : "；未配置 RSSHub"
  }）`;
}
