import type {
  ContentPlatform,
  ScriptDraftTopic,
  ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import { topicLabel } from "@/lib/script-workbench/catalog";
import type { ViralResearchQuery } from "@/lib/viral-research/types";

/** 研究检索只用主题关键词，不拼接具体选题句子。 */
export function buildResearchQueryTopic(input: {
  topic?: ScriptDraftTopic | null;
  topicOther?: string | null;
  idea?: string;
}): string {
  const raw = topicLabel(input.topic ?? null, input.topicOther ?? null);
  if (raw && raw !== "未选主题") {
    const keyword = raw
      .replace(/（[^）]*）/gu, "")
      .replace(/\([^)]*\)/gu, "")
      .trim();
    if (keyword.length >= 2) return keyword.slice(0, 40);
  }
  const idea = input.idea?.trim();
  if (idea) {
    const first = idea.split(/[，,。；;\n]/u)[0]?.trim() ?? idea;
    return first.slice(0, 40);
  }
  return "短视频";
}

export function buildResearchQuery(input: {
  topic?: ScriptDraftTopic | null;
  topicOther?: string | null;
  idea?: string;
  region?: string;
  audience?: string;
  contentGoal?: string;
  targetPlatforms?: ContentPlatform[];
  platformOther?: string;
}): ViralResearchQuery {
  const topic = buildResearchQueryTopic(input);
  const region = input.region?.trim();
  const audience = input.audience?.trim();
  const contentGoal = input.contentGoal?.trim();
  const targetPlatforms = input.targetPlatforms?.filter(
    (platform, index, values) => values.indexOf(platform) === index,
  );
  const platformOther = input.platformOther?.trim();
  return {
    topic,
    ...(region ? { region } : {}),
    ...(audience ? { audience: audience.slice(0, 120) } : {}),
    ...(contentGoal ? { contentGoal: contentGoal.slice(0, 120) } : {}),
    ...(targetPlatforms?.length ? { targetPlatforms } : {}),
    ...(targetPlatforms?.includes("other") && platformOther
      ? { platformOther }
      : {}),
  };
}

export function snapshotHasWebSearch(
  snapshot: ViralResearchSnapshot,
): boolean {
  return snapshot.items.some((item) => item.sourceType === "dashscope");
}

export function snapshotHasManualSamples(
  snapshot: ViralResearchSnapshot,
): boolean {
  return snapshot.items.some((item) => item.sourceType === "viral_sample");
}

export function snapshotHasUsableReferences(
  snapshot: ViralResearchSnapshot,
): boolean {
  return snapshot.items.some((item) => item.sourceType !== "owned_history");
}

/** 有联网结果或人工样本，且不仅只有账号历史。兼容旧快照：含 viral_sample 时不再依赖 searchPerformed。 */
export function snapshotHasExternalItems(
  snapshot: ViralResearchSnapshot,
): boolean {
  if (!snapshotHasUsableReferences(snapshot)) return false;
  return snapshot.searchPerformed || snapshotHasManualSamples(snapshot);
}

export function researchEvidenceBadgeLabel(
  snapshot: ViralResearchSnapshot,
): { tone: "success" | "warning"; label: string } {
  if (snapshotHasWebSearch(snapshot)) {
    return { tone: "success", label: "已完成联网检索" };
  }
  if (snapshotHasManualSamples(snapshot)) {
    return { tone: "success", label: "已载入人工样本" };
  }
  if (snapshot.searchPerformed) {
    return { tone: "success", label: "已有参考来源" };
  }
  return { tone: "warning", label: "未完成联网检索" };
}
