import { createHash } from "node:crypto";
import type { ViralResearchItem, ViralSample } from "@video-diagnosis/shared-types";
import type { ViralResearchQuery } from "@/lib/viral-research/types";
import {
  VIRAL_SAMPLE_PLATFORM_LABELS,
  parseOptionalMetric,
} from "@/lib/viral-research/sample-fields";

export { VIRAL_SAMPLE_PLATFORM_LABELS, parseOptionalMetric };

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
    evidenceLevel:
      sample.visibleMetrics &&
      Object.values(sample.visibleMetrics).some(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
        ? "verified_metric"
        : "platform_page",
    visibleMetrics: sample.visibleMetrics,
    relevanceReasons: reasons,
  };
}

export function viralSamplesToResearchItems(
  samples: readonly ViralSample[],
  query?: ViralResearchQuery,
): ViralResearchItem[] {
  const platforms = query?.targetPlatforms?.length
    ? new Set(query.targetPlatforms)
    : undefined;
  const expectedOther = query?.platformOther
    ?.normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
  return samples
    .filter((sample) => {
      if (platforms && !platforms.has(sample.platform)) return false;
      if (sample.platform !== "other" || !expectedOther) return true;
      return (
        sample.platformOther?.normalize("NFKC").trim().toLocaleLowerCase() ===
        expectedOther
      );
    })
    .map(viralSampleToResearchItem);
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
