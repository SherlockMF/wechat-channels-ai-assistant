import { describe, expect, it } from "vitest";
import type { ViralSample } from "@video-diagnosis/shared-types";
import {
  hotspotRefreshOwnerId,
  rejectInvalidHotspotRefreshToken,
} from "@/lib/hotspots/refresh-auth";

describe("hotspot refresh auth", () => {
  it("valid bearer token resolves configured owner", () => {
    const previousToken = process.env.HOTSPOT_REFRESH_TOKEN;
    const previousOwner = process.env.HOTSPOT_REFRESH_OWNER_ID;
    process.env.HOTSPOT_REFRESH_TOKEN = "secret-token";
    process.env.HOTSPOT_REFRESH_OWNER_ID = "cron-owner";
    try {
      const request = new Request("http://localhost/api/hotspots", {
        method: "POST",
        headers: { Authorization: "Bearer secret-token" },
      });
      expect(hotspotRefreshOwnerId(request)).toBe("cron-owner");
      expect(rejectInvalidHotspotRefreshToken(request)).toBeNull();
    } finally {
      if (previousToken === undefined) delete process.env.HOTSPOT_REFRESH_TOKEN;
      else process.env.HOTSPOT_REFRESH_TOKEN = previousToken;
      if (previousOwner === undefined) delete process.env.HOTSPOT_REFRESH_OWNER_ID;
      else process.env.HOTSPOT_REFRESH_OWNER_ID = previousOwner;
    }
  });

  it("wrong token returns 401 response", () => {
    const previousToken = process.env.HOTSPOT_REFRESH_TOKEN;
    process.env.HOTSPOT_REFRESH_TOKEN = "secret-token";
    try {
      const request = new Request("http://localhost/api/hotspots", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      });
      expect(hotspotRefreshOwnerId(request)).toBeNull();
      const rejected = rejectInvalidHotspotRefreshToken(request);
      expect(rejected?.status).toBe(401);
    } finally {
      if (previousToken === undefined) delete process.env.HOTSPOT_REFRESH_TOKEN;
      else process.env.HOTSPOT_REFRESH_TOKEN = previousToken;
    }
  });
});

describe("viral sample mapping", () => {
  it("maps manual sample to verified_metric research item", async () => {
    const { viralSampleToResearchItem } = await import("@/lib/viral-research/samples");
    const sample: ViralSample = {
      id: "11111111-1111-4111-8111-111111111111",
      ownerId: "local-user",
      url: "https://example.com/video/1",
      title: "全屋智能案例",
      platform: "weixin_channels",
      metricsSource: "manual",
      visibleMetrics: { views: 12000, likes: 340 },
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    };
    const item = viralSampleToResearchItem(sample);
    expect(item.sourceType).toBe("viral_sample");
    expect(item.evidenceLevel).toBe("verified_metric");
    expect(item.visibleMetrics?.views).toBe(12000);
    expect(item.site).toBe("视频号");
  });
});
