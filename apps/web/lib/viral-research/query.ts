import type { ScriptDraftTopic, ViralResearchSnapshot } from "@video-diagnosis/shared-types";
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
}): ViralResearchQuery {
  const topic = buildResearchQueryTopic(input);
  const region = input.region?.trim();
  return region ? { topic, region } : { topic };
}

export function snapshotHasExternalItems(
  snapshot: ViralResearchSnapshot,
): boolean {
  return (
    snapshot.searchPerformed &&
    snapshot.items.some((item) => item.sourceType !== "owned_history")
  );
}
