import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HotspotSnapshot, ViralResearchSnapshot } from "@video-diagnosis/shared-types";
import { resolveScriptResearchContext } from "@/lib/script-workbench/research-context";

const mocks = vi.hoisted(() => ({ hotspot: vi.fn(), research: vi.fn() }));
vi.mock("@/lib/hotspots/cache", () => ({ readHotspotSnapshot: mocks.hotspot, isHotspotSnapshotExpired: (snapshot: HotspotSnapshot) => Date.parse(snapshot.expiresAt) <= Date.now() }));
vi.mock("@/lib/viral-research/cache", () => ({ readViralResearchSnapshot: mocks.research, isViralResearchSnapshotExpired: (snapshot: ViralResearchSnapshot) => Date.parse(snapshot.expiresAt) <= Date.now() }));

beforeEach(() => vi.resetAllMocks());
describe("本地与云端共用脚本研究上下文", () => {
  it("按 owner 读取快照，保留选题和来源，排除未选择条目", async () => {
    mocks.hotspot.mockResolvedValue({ expiresAt: "2099-01-01", topicCards: [{ id: "card", clusterId: "cluster", sourceIds: ["one"] }], clusters: [{ id: "cluster", itemIds: ["one"] }], items: [{ id: "one", title: "原始来源" }, { id: "other" }] });
    mocks.research.mockResolvedValue({ expiresAt: "2099-01-01", topicCards: [{ id: "r-card" }], items: [{ id: "r-one" }, { id: "r-other" }] });
    const context = await resolveScriptResearchContext("alice", { idea: "选题", hotspotSnapshotId: "hs", hotspotTopicCardId: "card", researchSnapshotId: "rs", selectedTopicCardId: "r-card", selectedResearchItemIds: ["r-one"] });
    expect(mocks.hotspot).toHaveBeenCalledWith("alice", "hs");
    expect(mocks.research).toHaveBeenCalledWith("alice", "rs");
    expect(context.hotspotTopicCard?.id).toBe("card");
    expect(context.hotspotItems.map(item => item.id)).toEqual(["one"]);
    expect(context.selectedResearchItems.map(item => item.id)).toEqual(["r-one"]);
    expect(context.selectedTopicCard?.id).toBe("r-card");
  });
  it("过期或不属于 owner 的快照不能进入创作上下文", async () => {
    mocks.hotspot.mockResolvedValue({ expiresAt: "2000-01-01" });
    mocks.research.mockResolvedValue(null);
    const context = await resolveScriptResearchContext("bob", { idea: "选题", hotspotSnapshotId: "hs", researchSnapshotId: "rs" });
    expect(context).toMatchObject({ hotspotSnapshot: null, researchSnapshot: null, hotspotItems: [], selectedResearchItems: [] });
  });
});
