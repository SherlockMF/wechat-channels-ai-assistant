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

  it("keeps metric-less relevant samples but does not mark them verified", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "vr-samples-no-metrics-"));
    const samples: ViralSample[] = [
      {
        id: "55555555-5555-4555-8555-555555555555",
        ownerId: "owner-a",
        url: "https://example.com/video/no-metrics",
        title: "软水机安装避坑",
        platform: "douyin",
        metricsSource: "manual",
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
    expect(result.snapshot.items[0]?.evidenceLevel).toBe("platform_page");
  });

  it("filters manual samples by topic and requested target platform", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "vr-samples-filter-"));
    const base = {
      ownerId: "owner-a",
      metricsSource: "manual" as const,
      visibleMetrics: { likes: 10 },
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    };
    const samples: ViralSample[] = [
      {
        ...base,
        id: "66666666-6666-4666-8666-666666666661",
        url: "https://example.com/douyin-water",
        title: "软水机实测",
        platform: "douyin",
      },
      {
        ...base,
        id: "66666666-6666-4666-8666-666666666662",
        url: "https://example.com/bilibili-water",
        title: "软水机拆解",
        platform: "bilibili",
      },
      {
        ...base,
        id: "66666666-6666-4666-8666-666666666663",
        url: "https://example.com/douyin-light",
        title: "智能灯光实测",
        platform: "douyin",
      },
    ];
    const result = await researchViralVideos(
      "owner-a",
      {
        query: { topic: "软水", targetPlatforms: ["douyin"] },
        forceRefresh: true,
      },
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
    expect(result.snapshot.items.map((item) => item.title)).toEqual([
      "软水机实测",
    ]);
  });
});

describe("viral sample helpers", () => {
  it("其他平台按自定义名称精确筛选", async () => {
    const { viralSamplesToResearchItems } = await import(
      "@/lib/viral-research/samples"
    );
    const base = {
      ownerId: "owner-a",
      url: "https://example.com/video",
      title: "软水测试",
      platform: "other" as const,
      metricsSource: "manual" as const,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    };
    const samples: ViralSample[] = [
      { ...base, id: "88888888-8888-4888-8888-888888888881", platformOther: "Threads" },
      { ...base, id: "88888888-8888-4888-8888-888888888882", platformOther: "LinkedIn" },
    ];
    expect(
      viralSamplesToResearchItems(samples, {
        topic: "软水",
        targetPlatforms: ["other"],
        platformOther: " threads ",
      }).map((item) => item.id),
    ).toEqual([expect.stringMatching(/^vs-/u)]);
    expect(
      viralSamplesToResearchItems(samples, {
        topic: "软水",
        targetPlatforms: ["other"],
        platformOther: " threads ",
      })[0]?.site,
    ).toBe("Threads");
  });

  it("labels newly supported content platforms", async () => {
    const { viralSamplePlatformLabel } = await import(
      "@/lib/viral-research/samples"
    );
    expect(
      viralSamplePlatformLabel({
        id: "77777777-7777-4777-8777-777777777777",
        ownerId: "owner-a",
        url: "https://www.tiktok.com/@creator/video/1",
        title: "TikTok sample",
        platform: "tiktok",
        metricsSource: "manual",
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
      }),
    ).toBe("TikTok");
  });

  it("offers every supported platform in the manual sample form", async () => {
    const formModule = (await import(
      "@/features/viral-research/viral-sample-form"
    )) as unknown as { VIRAL_SAMPLE_PLATFORM_OPTIONS: string[] };
    expect(formModule.VIRAL_SAMPLE_PLATFORM_OPTIONS).toEqual([
      "weixin_channels",
      "douyin",
      "xiaohongshu",
      "bilibili",
      "kuaishou",
      "youtube_shorts",
      "tiktok",
      "other",
    ]);
  });

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
