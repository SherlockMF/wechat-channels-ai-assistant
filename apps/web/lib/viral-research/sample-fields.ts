import type { ViralSample } from "@video-diagnosis/shared-types";

/** Client-safe labels and field parsers; keep Node-only hashing out of UI bundles. */
export const VIRAL_SAMPLE_PLATFORM_LABELS: Record<
  ViralSample["platform"],
  string
> = {
  weixin_channels: "视频号",
  douyin: "抖音",
  xiaohongshu: "小红书",
  bilibili: "B站",
  kuaishou: "快手",
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
  other: "其他平台",
};

export function parseOptionalMetric(value: string): number | undefined {
  const raw = value.trim();
  if (!raw || !/^\d+$/u.test(raw)) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
