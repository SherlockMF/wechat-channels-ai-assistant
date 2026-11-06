import type { ScriptDraftInput } from "@video-diagnosis/shared-types";
import { isHotspotSnapshotExpired, readHotspotSnapshot } from "@/lib/hotspots/cache";
import { isViralResearchSnapshotExpired, readViralResearchSnapshot } from "@/lib/viral-research/cache";

/** 本地与云端共用同一来源校验，避免转为脚本时丢失选中的研究资料。 */
export async function resolveScriptResearchContext(ownerId: string, input: ScriptDraftInput) {
  const [storedHotspot, storedResearch] = await Promise.all([
    input.hotspotSnapshotId ? readHotspotSnapshot(ownerId, input.hotspotSnapshotId) : null,
    input.researchSnapshotId ? readViralResearchSnapshot(ownerId, input.researchSnapshotId) : null,
  ]);
  const hotspotSnapshot = storedHotspot && !isHotspotSnapshotExpired(storedHotspot) ? storedHotspot : null;
  const researchSnapshot = storedResearch && !isViralResearchSnapshotExpired(storedResearch) ? storedResearch : null;
  const hotspotTopicCard = hotspotSnapshot?.topicCards.find(card => card.id === input.hotspotTopicCardId) ?? null;
  const hotspotCluster = hotspotSnapshot?.clusters.find(cluster => cluster.id === (hotspotTopicCard?.clusterId ?? input.hotspotClusterId));
  const hotspotIds = new Set([...(hotspotCluster?.itemIds ?? []), ...(hotspotTopicCard?.sourceIds ?? [])]);
  const researchIds = new Set(input.selectedResearchItemIds ?? []);
  return {
    hotspotSnapshot, hotspotTopicCard,
    hotspotItems: hotspotSnapshot?.items.filter(item => hotspotIds.has(item.id)) ?? [],
    researchSnapshot,
    selectedResearchItems: researchSnapshot?.items.filter(item => researchIds.has(item.id)) ?? [],
    selectedTopicCard: researchSnapshot?.topicCards.find(card => card.id === input.selectedTopicCardId) ?? null,
  };
}
