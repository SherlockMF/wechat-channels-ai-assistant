import { createHash } from "node:crypto";
import type { ViralResearchItem, ViralSample } from "@video-diagnosis/shared-types";

export const VIRAL_SAMPLE_PLATFORM_LABELS: Record<
  ViralSample["platform"],
  string
> = {
  weixin_channels: "视频号",
  douyin: "抖音",
  xiaohongshu: "小红书",
  bilibili: "B站",
  other: "其他平台",
};

export function viralSamplePlatformLabel(sample: ViralSample): string {
  if (sample.platform === "other" && sample.platformOther?.trim()) {
    return sample.platformOther.trim();
  }
  return VIRAL_SAMPLE_PLATFORM_LABELS[sample.platform];
}

export function viralSampleToResearchItem(sample: ViralSample): ViralResearchItem {
  const reasons = ["人工录入的爆款样本"];
  if (sample.structureNotes?.trim()) {
    reasons.push("含结构拆解备注");
  }
  return {
    id: `vs-${createHash("sha256").update(sample.id).digest("hex").slice(0, 24)}`,
    sourceType: "viral_sample",
    title: sample.title,
    url: sample.url,
    site: viralSamplePlatformLabel(sample),
    snippet: [sample.notes, sample.structureNotes].filter(Boolean).join("\n") || undefined,
    evidenceLevel: "verified_metric",
    visibleMetrics: sample.visibleMetrics,
    relevanceReasons: reasons,
  };
}

export function viralSamplesToResearchItems(
  samples: readonly ViralSample[],
): ViralResearchItem[] {
  return samples.map(viralSampleToResearchItem);
}

function isViralSampleBackendUnsupported(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error &&
    "status" in error &&
    (error as { status: unknown }).status === 501
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    error.message.includes("爆款样本库当前仅支持 LOCAL 模式")
  );
}

/** 非 LOCAL 后端不支持样本库时静默降级为空列表，避免拖垮整次研究。 */
export async function loadViralSamplesForResearch(
  loader: () => Promise<ViralSample[]>,
): Promise<ViralSample[]> {
  try {
    return await loader();
  } catch (error) {
    if (isViralSampleBackendUnsupported(error)) return [];
    throw error;
  }
}

export function parseOptionalMetric(value: string): number | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  if (!/^\d+$/u.test(raw)) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
