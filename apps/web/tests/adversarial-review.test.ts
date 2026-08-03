import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import { normalizeOwnerId } from "@/lib/data/owner";
import { buildRuleDiagnosis } from "@/lib/analysis/rules";
import { calculateAccountBaseline } from "@/lib/metrics/account";
import { DashScopeScriptProvider } from "@/lib/script-workbench/dashscope-provider";

function record(id: string, description: string): ImportedVideoRecord {
  return {
    id,
    importId: "import",
    spreadsheetRow: 2,
    platformVideoId: null,
    normalizedPlatformVideoId: null,
    description,
    normalizedDescription: description,
    publishedAt: "2026-01-01T00:00:00.000Z",
    completionRate: 0.1,
    averageWatchSeconds: 10,
    views: 100,
    recommendations: null,
    likes: 5,
    comments: 1,
    shares: 2,
    follows: 1,
    shareToChat: null,
    setAsRingtone: null,
    setAsStatus: null,
    setAsMomentsCover: null,
    wecomLinkClicks: null,
    wecomLinkUsers: null,
    contactAddCount: null,
    contactAddUsers: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adversarial boundaries", () => {
  it("maps path-like owner headers to a stable safe segment", () => {
    expect(normalizeOwnerId("local-user")).toBe("local-user");
    const normalized = normalizeOwnerId("../../outside\\tenant");
    expect(normalized).toMatch(/^owner-[a-f0-9]{64}$/u);
    expect(normalized).not.toMatch(/[\\/]/u);
    expect(normalizeOwnerId("../../outside\\tenant")).toBe(normalized);
  });

  it("does not label the current title as a historical similar title", () => {
    const current = record("current", "智能窗帘怎么选");
    const result = buildRuleDiagnosis(
      current,
      calculateAccountBaseline([current]),
      30,
    );
    expect(result.titleSuggestions.every((item) => item.basedOnSimilarTitles.length === 0)).toBe(true);

    const withHistory = buildRuleDiagnosis(
      current,
      calculateAccountBaseline([current]),
      30,
      [
        {
          description: "厨房智能窗帘避坑",
          completionRate: 0.2,
          averageWatchSeconds: 12,
          views: 200,
          likes: 8,
          follows: 2,
          similarityScore: 0.8,
          matchedTags: [],
        },
      ],
    );
    expect(withHistory.titleSuggestions[0]?.basedOnSimilarTitles).toEqual([
      "厨房智能窗帘避坑",
    ]);
  });

  it("marks script output as mock-degraded when DashScope fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const provider = new DashScopeScriptProvider();
    const output = await provider.generate({
      format: "koubo",
      topic: "water",
      subTopics: [],
      processKinds: [],
      input: { idea: "软水机怎么选" },
    });
    expect(output.pipeline).toBe("koubo");
    expect(provider.resultProviderName).toBe("mock-degraded");
    expect(
      output.gapsOrWarnings.some((item) => item.includes("降级")),
    ).toBe(true);
  });
});
