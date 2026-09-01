import type { ContentPlatform } from "@video-diagnosis/shared-types";

export interface PlatformCatalogItem {
  id: ContentPlatform;
  label: string;
  guidance: string;
  capabilities: {
    contentStrategy: true;
    manualInput: true;
    autoPublish: false;
    metricSync: false;
  };
}
const MANUAL_CAPABILITIES = {
  contentStrategy: true,
  manualInput: true,
  autoPublish: false,
  metricSync: false,
} as const;

export const PLATFORM_CATALOG: readonly PlatformCatalogItem[] = [
  {
    id: "weixin_channels",
    label: "视频号",
    guidance: "熟人社交传播语境；开头直接、表达可信，CTA 自然承接咨询或转发。",
    capabilities: MANUAL_CAPABILITIES,
  },
  {
    id: "douyin",
    label: "抖音",
    guidance: "前 2～3 秒快速兑现看点，短句高密度，画面和字幕共同推进。",
    capabilities: MANUAL_CAPABILITIES,
  },
  {
    id: "xiaohongshu",
    label: "小红书",
    guidance: "强调真实经验、清单和可收藏信息，标题具体，避免强销售口吻。",
    capabilities: MANUAL_CAPABILITIES,
  },
  {
    id: "bilibili",
    label: "B站",
    guidance: "允许更完整的背景与论证，结构清晰，以信息价值和可信细节留住观看。",
    capabilities: MANUAL_CAPABILITIES,
  },
  {
    id: "kuaishou",
    label: "快手",
    guidance: "真实直接、人物感强，优先现场过程、结果对比和自然互动。",
    capabilities: MANUAL_CAPABILITIES,
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    guidance: "单一主题、全球受众可理解的快速叙事；标题与口播避免依赖本地隐语。",
    capabilities: MANUAL_CAPABILITIES,
  },
  {
    id: "tiktok",
    label: "TikTok",
    guidance: "第一秒给视觉动作或结果，语言简洁，按目标地区文化语境校准表达。",
    capabilities: MANUAL_CAPABILITIES,
  },
  {
    id: "other",
    label: "其他平台",
    guidance: "遵循用户提供的平台名称与受众语境；未知规则不得臆测。",
    capabilities: MANUAL_CAPABILITIES,
  },
] as const;

const PLATFORM_BY_ID = new Map(
  PLATFORM_CATALOG.map((item) => [item.id, item] as const),
);

export function platformLabel(
  platform: ContentPlatform,
  otherPlatformName?: string,
): string {
  if (platform === "other" && otherPlatformName?.trim()) {
    return otherPlatformName.trim();
  }
  return PLATFORM_BY_ID.get(platform)?.label ?? platform;
}

export function platformPromptGuidance(
  platforms: readonly ContentPlatform[],
  otherPlatformName?: string,
): string {
  return platforms
    .map((platform) => {
      const item = PLATFORM_BY_ID.get(platform);
      if (!item) return "";
      return `${platformLabel(platform, otherPlatformName)}：${item.guidance}`;
    })
    .filter(Boolean)
    .join("\n");
}
