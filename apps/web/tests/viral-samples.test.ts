import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { researchViralVideos } from "@/lib/viral-research/service";
import type { ViralSample } from "@video-diagnosis/shared-types";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("viral samples in research service", () => {
  it("merges manual samples into snapshot items", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "vr-samples-"));
    const samples: ViralSample[] = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        ownerId: "owner-a",
        url: "https://example.com/video/2",
        title: "软水机实测",
        platform: "douyin",
        metricsSource: "manual",
        visibleMetrics: { likes: 900 },
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
    ];
    const result = await researchViralVideos(
      "owner-a",
      { query: { topic: "软水" }, forceRefresh: true },
      {
        config: {
          dashscope: {
            enabled: false,
            apiKey: "",
            apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
            model: "qwen-plus",
            freshnessDays: 7,
          },
        },
        viralSamples: samples,
        ownedHistory: [],
        storageRoot: tempDir,
      },
    );
    const sampleItems = result.snapshot.items.filter(
      (item) => item.sourceType === "viral_sample",
    );
    expect(sampleItems).toHaveLength(1);
    expect(sampleItems[0]?.evidenceLevel).toBe("verified_metric");
    expect(result.snapshot.provider).toContain("viral-samples");
    expect(result.snapshot.searchPerformed).toBe(true);
    expect(result.snapshot.limitations[0]).toContain("爆款样本");
  });
});

describe("viral sample helpers", () => {
  it("loadViralSamplesForResearch swallows unsupported backend errors", async () => {
    const { loadViralSamplesForResearch } = await import("@/lib/viral-research/samples");
    await expect(
      loadViralSamplesForResearch(async () => {
        throw Object.assign(new Error("爆款样本库当前仅支持 LOCAL 模式"), {
          status: 501,
        });
      }),
    ).resolves.toEqual([]);
  });

  it("parseOptionalMetric rejects invalid numbers", async () => {
    const { parseOptionalMetric } = await import("@/lib/viral-research/samples");
    expect(parseOptionalMetric("1200")).toBe(1200);
    expect(parseOptionalMetric("")).toBeUndefined();
    expect(parseOptionalMetric("12.5")).toBeUndefined();
    expect(parseOptionalMetric("abc")).toBeUndefined();
  });
});
