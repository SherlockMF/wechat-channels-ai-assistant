import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ImportedVideoRecord,
  ViralResearchItem,
  ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
// fixture 字段形状取自百炼官方文档示例：search_results 只有 index/title/url。
import searchInfoFixture from "@/tests/fixtures/dashscope-search-info.json";
import { defaultUserSettings } from "@/lib/settings/schema";
import { selectOwnedHistoryItems } from "@/lib/viral-research/account-fit";
import {
  createViralResearchSnapshotId,
  isViralResearchSnapshotExpired,
  readCachedViralResearchSnapshot,
  readViralResearchSnapshot,
  viralResearchQueryKey,
  writeViralResearchSnapshot,
} from "@/lib/viral-research/cache";
import { viralResearchConfigFromSettings } from "@/lib/viral-research/config";
import { searchDashScope, prefersMultimodalWebSearch } from "@/lib/viral-research/dashscope";
import { buildResearchQuery, buildResearchQueryTopic, snapshotHasExternalItems } from "@/lib/viral-research/query";
import { researchViralVideos } from "@/lib/viral-research/service";
import {
  enforceResearchItemPolicy,
  filterResearchItemsByQuery,
  isPreferredVideoPlatformUrl,
  sanitizeResearchUrl,
} from "@/lib/viral-research/source-policy";
import type { ViralResearchRuntimeConfig } from "@/lib/viral-research/types";

let tempDir: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function publicItem(
  id: string,
  url: string,
  author?: string,
): ViralResearchItem {
  return {
    id,
    sourceType: "dashscope",
    title: `来源 ${id}`,
    url,
    site: "同一站点",
    ...(author ? { author } : {}),
    evidenceLevel: "public_source",
    relevanceReasons: [],
  };
}

function record(
  id: string,
  description: string,
  values: Partial<ImportedVideoRecord> = {},
): ImportedVideoRecord {
  return {
    id,
    importId: "import-1",
    spreadsheetRow: 1,
    platformVideoId: null,
    normalizedPlatformVideoId: null,
    description,
    normalizedDescription: description,
    publishedAt: "2026-08-01T00:00:00.000Z",
    completionRate: null,
    averageWatchSeconds: null,
    views: null,
    recommendations: null,
    likes: null,
    comments: null,
    shares: null,
    follows: null,
    shareToChat: null,
    setAsRingtone: null,
    setAsStatus: null,
    setAsMomentsCover: null,
    wecomLinkClicks: null,
    wecomLinkUsers: null,
    contactAddCount: null,
    contactAddUsers: null,
    ...values,
  };
}

const runtimeConfig: ViralResearchRuntimeConfig = {
  dashscope: {
    enabled: true,
    apiKey: "sk-test",
    apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    model: "qwen-plus",
    freshnessDays: 30,
  },
};

describe("viral research source policy", () => {
  it("buildResearchQueryTopic uses topic keyword only", () => {
    expect(
      buildResearchQueryTopic({
        topic: "smart_home",
        idea: "展示全屋智能综合场景",
      }),
    ).toBe("全屋智能");
  });

  it("buildResearchQuery omits region unless explicitly provided", () => {
    expect(
      buildResearchQuery({
        topic: "smart_home",
        idea: "展示全屋智能综合场景",
      }),
    ).toEqual({ topic: "全屋智能" });
    expect(
      buildResearchQuery({
        topic: "smart_home",
        region: "开远及周边",
      }),
    ).toEqual({ topic: "全屋智能", region: "开远及周边" });
  });

  it("buildResearchQuery carries target platforms and custom platform label", () => {
    expect(
      buildResearchQuery({
        topic: "smart_home",
        targetPlatforms: ["douyin", "other"],
        platformOther: "本地生活平台",
      }),
    ).toEqual({
      topic: "全屋智能",
      targetPlatforms: ["douyin", "other"],
      platformOther: "本地生活平台",
    });
  });

  it("snapshotHasExternalItems requires dashscope items and searchPerformed", () => {
    expect(
      snapshotHasExternalItems({
        id: "s1",
        ownerId: "o1",
        query: { topic: "全屋智能" },
        provider: "owned-history",
        searchPerformed: false,
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        items: [
          {
            id: "h1",
            sourceType: "owned_history",
            title: "历史",
            evidenceLevel: "account_history",
            relevanceReasons: [],
          },
        ],
        topicCards: [],
        commonPatterns: [],
        limitations: [],
      }),
    ).toBe(false);
  });

  it("snapshotHasExternalItems is true for manual samples without web search", async () => {
    const { snapshotHasExternalItems, researchEvidenceBadgeLabel } = await import(
      "@/lib/viral-research/query"
    );
    const snapshot = {
      id: "s2",
      ownerId: "o1",
      query: { topic: "软水" },
      provider: "viral-samples",
      searchPerformed: true,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      items: [
        {
          id: "vs-1",
          sourceType: "viral_sample" as const,
          title: "爆款样本",
          url: "https://example.com/v/1",
          evidenceLevel: "verified_metric" as const,
          relevanceReasons: ["人工录入"],
        },
      ],
      topicCards: [],
      commonPatterns: [],
      limitations: [],
    };
    expect(snapshotHasExternalItems(snapshot)).toBe(true);
    expect(researchEvidenceBadgeLabel(snapshot).label).toBe("已载入人工样本");
  });

  it("snapshotHasExternalItems stays true for legacy snapshots with samples but searchPerformed false", async () => {
    const { snapshotHasExternalItems } = await import("@/lib/viral-research/query");
    expect(
      snapshotHasExternalItems({
        id: "legacy",
        ownerId: "o1",
        query: { topic: "软水" },
        provider: "viral-samples",
        searchPerformed: false,
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        items: [
          {
            id: "vs-legacy",
            sourceType: "viral_sample",
            title: "旧快照样本",
            url: "https://example.com/v/legacy",
            evidenceLevel: "verified_metric",
            relevanceReasons: [],
          },
        ],
        topicCards: [],
        commonPatterns: [],
        limitations: [],
      }),
    ).toBe(true);
  });

  it("accepts preferred platform pages with domain expansion match", () => {
    expect(
      isPreferredVideoPlatformUrl("https://www.douyin.com/video/123"),
    ).toBe(true);
    const accepted = filterResearchItemsByQuery(
      { topic: "全屋智能" },
      [
        {
          id: "douyin-1",
          sourceType: "dashscope",
          title: "智能家居灯光联动案例",
          url: "https://www.douyin.com/video/123",
          evidenceLevel: "public_source",
          relevanceReasons: [],
        },
      ],
    );
    expect(accepted).toHaveLength(1);
    expect(isPreferredVideoPlatformUrl("https://notdouyin.com/video/123")).toBe(false);
    expect(
      isPreferredVideoPlatformUrl("https://example.com/path/douyin.com/video/123"),
    ).toBe(false);
  });

  it("清洗 URL、去重，并只限制明确的同作者来源", () => {
    expect(
      sanitizeResearchUrl(
        "https://user:pass@example.com/video/1?utm_source=x&keep=1#fragment",
      ),
    ).toBe("https://example.com/video/1?keep=1");
    expect(sanitizeResearchUrl("javascript:alert(1)")).toBeUndefined();

    const accepted = enforceResearchItemPolicy([
      publicItem("a1", "https://example.com/1", "作者甲"),
      publicItem("a2", "https://example.com/2", "作者甲"),
      publicItem("a3", "https://example.com/3", "作者甲"),
      publicItem("u1", "https://example.com/4"),
      publicItem("u2", "https://example.com/5"),
      publicItem("duplicate", "https://example.com/5#x"),
    ]);
    expect(accepted.map((item) => item.id)).toEqual(["a1", "a2", "u1", "u2"]);
  });

  it("丢弃与视频主题无关的联网搜索结果", () => {
    const candidates = [
      {
        ...publicItem("water", "https://example.com/water"),
        title: "芜湖怡口全屋净水：家庭水质改造实拍",
      },
      {
        ...publicItem("live", "https://example.com/live"),
        title: "小红书直播爆单指南",
      },
      {
        ...publicItem("news", "https://example.com/news"),
        title: "社交媒体热搜榜成为清朗对象",
      },
      {
        ...publicItem("softener", "https://example.com/softener"),
        title: "软水机水垢前后对比测试",
      },
    ];
    expect(
      filterResearchItemsByQuery(
        { topic: "全屋净水：种草全屋净水" },
        candidates,
      ).map((item) => item.id),
    ).toEqual(["water", "softener"]);
  });
});

describe("DashScope native search", () => {
  it("识别需要 multimodal 联网检索的模型", () => {
    expect(prefersMultimodalWebSearch("qwen3.7-plus")).toBe(true);
    expect(prefersMultimodalWebSearch("qwen3.5-flash")).toBe(true);
    expect(prefersMultimodalWebSearch("qwen-plus")).toBe(false);
    expect(prefersMultimodalWebSearch("qwen3-max")).toBe(false);
  });

  it("非官方 host 不复用全局 DashScope Key", () => {
    const settings = defaultUserSettings();
    settings.providers.dashscopeApiKey = "sk-shared-secret";
    settings.providers.webResearch.apiBaseUrl = "https://example.com/api/v1";
    const config = viralResearchConfigFromSettings(settings);
    expect(config.dashscope.apiKey).toBe("");
  });

  it("文本分支发送 forced_search/max/freshness，并按域名给出证据等级", async () => {
    let requestedUrl = "";
    let requestedBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: [
                {
                  index: 1,
                  title: "智能灯光案例一",
                  url: "https://www.douyin.com/video/1?utm_source=test",
                },
                {
                  index: 2,
                  title: "智能灯光案例二",
                  url: "https://www.ithome.com/0/800/001.htm",
                },
                {
                  index: 3,
                  title: "智能灯光案例三",
                  url: "https://example.com/three",
                },
                { index: 4, title: "不安全", url: "javascript:alert(1)" },
              ],
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    commonPatterns: ["前三秒用生活痛点建立冲突"],
                    sourceJudgements: [
                      {
                        index: 1,
                        relevant: true,
                        kind: "platform_page",
                        reason: "抖音智能灯光实拍",
                      },
                    ],
                    topicCards: [],
                  }),
                },
              },
            ],
          },
        }),
        { status: 200 },
      );
    });

    const result = await searchDashScope(
      runtimeConfig.dashscope,
      { topic: "智能灯光", targetPlatforms: ["douyin"] },
      fetchImpl as typeof fetch,
    );
    expect(requestedUrl).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
    );
    const parameters = requestedBody.parameters as Record<string, unknown>;
    expect(parameters.enable_search).toBe(true);
    expect(parameters.result_format).toBe("message");
    expect(parameters.search_options).toEqual({
      forced_search: true,
      search_strategy: "max",
      enable_source: true,
      freshness: 30,
    });
    const input = requestedBody.input as {
      messages: Array<{ content: string }>;
    };
    expect(input.messages[0]?.content).toContain(
      "只检索与主题、受众、内容目标和地域直接相关的内容",
    );
    expect(input.messages[0]?.content).toContain(
      "排除时政、灾难、社会争议",
    );
    expect(input.messages[0]?.content).toContain("同赛道关键词扩展检索");
    expect(input.messages[0]?.content).toContain("目标发布平台：抖音");
    expect(input.messages[0]?.content).toContain("sourceJudgements");
    expect(result.searchPerformed).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.evidenceLevel)).toEqual([
      "platform_page",
      "media_article",
      "public_source",
    ]);
    expect(result.items.some((item) => item.visibleMetrics)).toBe(false);
    expect(result.analysis?.commonPatterns).toEqual(["前三秒用生活痛点建立冲突"]);
    expect(result.analysis?.sourceJudgements).toEqual([
      {
        index: 1,
        relevant: true,
        kind: "platform_page",
        reason: "抖音智能灯光实拍",
      },
    ]);
  });

  it("联网结果不再产生 verified_metric，且互动指标一律为空", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(searchInfoFixture), { status: 200 }),
    );
    const result = await searchDashScope(
      runtimeConfig.dashscope,
      { topic: "全屋智能" },
      fetchImpl as typeof fetch,
    );
    expect(result.items).toHaveLength(5);
    expect(
      result.items.some((item) => item.evidenceLevel === "verified_metric"),
    ).toBe(false);
    expect(result.items.every((item) => item.visibleMetrics === undefined)).toBe(
      true,
    );
  });

  it("qwen3.7-plus 等多模态模型直接走 multimodal-generation，避免 text-generation url error", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      const payload = {
        output: {
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  commonPatterns: ["结果前置"],
                  topicCards: [],
                }),
              },
            },
          ],
          search_info: {
            search_results: [
              {
                index: 1,
                title: "智能窗帘案例",
                url: "https://example.com/curtain",
                site_name: "装修站",
              },
            ],
          },
        },
      };
      return new Response(`data:${JSON.stringify(payload)}\n\n`, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const result = await searchDashScope(
      { ...runtimeConfig.dashscope, model: "qwen3.7-plus" },
      { topic: "智能窗帘" },
      fetchImpl as typeof fetch,
    );
    expect(requests.map((item) => item.url)).toEqual([
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    ]);
    const parameters = (
      JSON.parse(String(requests[0]?.init?.body)) as {
        parameters: { search_options: Record<string, unknown> };
      }
    ).parameters;
    expect(parameters.search_options).toEqual({
      search_strategy: "agent",
      enable_source: true,
    });
    expect(result.searchPerformed).toBe(true);
    expect(result.items[0]?.url).toBe("https://example.com/curtain");
  });

  it("大量 reasoning SSE 事件时仍保留已到手的 search_info", async () => {
    const sources = [1, 2, 3].map((index) => ({
      index,
      title: `来源 ${index}`,
      url: `https://many-events${index}.example.com/video`,
      site_name: `站点 ${index}`,
    }));
    const event = (id: number, payload: unknown) =>
      `id:${id}\nevent:result\ndata:${JSON.stringify(payload)}\n\n`;
    const sseEvents = [
      event(1, {
        output: {
          choices: [{ message: { role: "assistant", content: [] } }],
          search_info: { search_results: sources },
        },
      }),
      ...Array.from({ length: 1500 }, (_, index) =>
        event(index + 2, {
          output: {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: [],
                  reasoning_content: "想",
                },
              },
            ],
          },
        }),
      ),
      event(1502, {
        output: {
          choices: [
            {
              message: {
                role: "assistant",
                content: [
                  {
                    text: JSON.stringify({
                      commonPatterns: ["结果前置"],
                      topicCards: [],
                    }),
                  },
                ],
              },
            },
          ],
        },
      }),
    ];
    const encoder = new TextEncoder();
    let eventIndex = 0;
    const fetchImpl = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          const next = sseEvents[eventIndex];
          eventIndex += 1;
          if (next === undefined) controller.close();
          else controller.enqueue(encoder.encode(next));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const result = await searchDashScope(
      { ...runtimeConfig.dashscope, model: "qwen3.7-plus" },
      { topic: "智能窗帘" },
      fetchImpl as typeof fetch,
    );
    expect(result.status).toBe("ok");
    expect(result.items).toHaveLength(3);
    expect(result.analysis?.commonPatterns).toEqual(["结果前置"]);
  });

  it("url error fallback 可增量处理累计超过 8 MiB 的 SSE 与重复来源", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const sources = Array.from({ length: 85 }, (_, index) => ({
      index: index + 1,
      title: `SSE 来源 ${index + 1}`,
      url: `https://source${index + 1}.example.com/video?utm_source=sse`,
      site_name: `站点 ${index + 1}`,
    }));
    sources.push({
      index: 86,
      title: "重复来源",
      url: "https://source1.example.com/video?utm_source=duplicate",
      site_name: "重复站点",
    });
    const analysis = JSON.stringify({
      commonPatterns: ["SSE 增量内容已合并"],
      topicCards: [],
    });
    const splitAt = Math.floor(analysis.length / 2);
    const event = (id: number, payload: unknown) =>
      `id:${id}\nevent:result\n:HTTP_STATUS/200\ndata:${JSON.stringify(payload)}\n\n`;
    const sseEvents = [
      event(1, {
        output: {
          choices: [{ message: { role: "assistant", content: [] } }],
          search_info: { search_results: sources },
        },
        request_id: "request-sse",
      }),
      ...Array.from({ length: 583 }, (_, index) =>
        event(index + 2, {
          output: {
            choices: [{ message: { role: "assistant", content: [] } }],
            search_info: { search_results: sources },
          },
          padding: "x".repeat(10_000),
        }),
      ),
      event(585, {
        output: {
          choices: [
            {
              message: {
                role: "assistant",
                content: [{ text: analysis.slice(0, splitAt) }],
              },
            },
          ],
          search_info: { search_results: [] },
        },
      }),
      event(586, {
        output: {
          choices: [
            {
              message: {
                role: "assistant",
                content: [{ text: analysis.slice(splitAt) }],
              },
            },
          ],
        },
      }),
    ];
    const encoder = new TextEncoder();
    const rawBytes = sseEvents.reduce(
      (total, item) => total + encoder.encode(item).byteLength,
      0,
    );
    expect(rawBytes).toBeGreaterThan(8 * 1024 * 1024);
    expect(rawBytes).toBeLessThan(32 * 1024 * 1024);
    const fetchImpl = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        requests.push({ url: String(input), init });
        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              code: "InvalidParameter",
              message: "url error, please check url",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        let eventIndex = 0;
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            const next = sseEvents[eventIndex];
            eventIndex += 1;
            if (next === undefined) controller.close();
            else controller.enqueue(encoder.encode(next));
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    );

    const result = await searchDashScope(
      { ...runtimeConfig.dashscope, model: "qwen-plus" },
      { topic: "全屋智能" },
      fetchImpl as typeof fetch,
    );

    expect(requests.map((request) => request.url)).toEqual([
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    ]);
    expect(new Headers(requests[1]?.init?.headers).get("X-DashScope-SSE")).toBe(
      "enable",
    );
    const textBody = JSON.parse(String(requests[0]?.init?.body)) as {
      input: { messages: Array<{ content: unknown }> };
    };
    const multimodalBody = JSON.parse(String(requests[1]?.init?.body)) as {
      input: { messages: Array<{ content: unknown }> };
      parameters: {
        incremental_output: boolean;
        search_options: Record<string, unknown>;
      };
    };
    expect(typeof textBody.input.messages[0]?.content).toBe("string");
    expect(multimodalBody.input.messages[0]?.content).toEqual([
      { text: expect.any(String) },
    ]);
    expect(multimodalBody.parameters.incremental_output).toBe(true);
    expect(multimodalBody.parameters.search_options).toEqual({
      search_strategy: "agent",
      enable_source: true,
    });
    expect(result.status).toBe("ok");
    expect(result.searchPerformed).toBe(true);
    expect(result.items).toHaveLength(85);
    expect(result.items[0]?.url).toBe("https://source1.example.com/video");
    expect(result.analysis?.commonPatterns).toEqual(["SSE 增量内容已合并"]);
  });

  it("拒绝把联网 Key 发往非官方 host", async () => {
    const fetchImpl = vi.fn();
    const result = await searchDashScope(
      { ...runtimeConfig.dashscope, apiBaseUrl: "https://example.com/api/v1" },
      { topic: "智能家居" },
      fetchImpl as typeof fetch,
    );
    expect(result.status).toBe("misconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("SSE 403 免费额度错误会给出可读的 degradedReason", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        [
          "id:1",
          "event:error",
          ":HTTP_STATUS/403",
          'data:{"code":"AllocationQuota.FreeTierOnly","message":"Free quota exhausted."}',
          "",
        ].join("\n"),
        { status: 403 },
      ),
    );
    const result = await searchDashScope(
      { ...runtimeConfig.dashscope, model: "qwen3.7-plus" },
      { topic: "全屋智能" },
      fetchImpl as typeof fetch,
    );
    expect(result.status).toBe("permission_denied");
    expect(result.degradedReason).toContain("免费额度已用尽");
  });

  it("全部备选模型失败时优先展示额度类错误", async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model?: string };
      if (body.model === "qwen3.7-plus") {
        return new Response(
          [
            "id:1",
            "event:error",
            'data:{"code":"AllocationQuota.FreeTierOnly","message":"Free quota exhausted."}',
            "",
          ].join("\n"),
          { status: 403 },
        );
      }
      return new Response(
        JSON.stringify({
          code: "Model.AccessDenied",
          message: "Model access denied.",
        }),
        { status: 403 },
      );
    });
    const result = await searchDashScope(
      { ...runtimeConfig.dashscope, model: "qwen3.7-plus" },
      { topic: "全屋智能" },
      fetchImpl as typeof fetch,
    );
    expect(result.degradedReason).toContain("免费额度已用尽");
    expect(result.degradedReason).toContain("已尝试全部备选模型与 Key");
  });
});

describe("owner-scoped immutable cache", () => {
  it("缓存 key 随 model 变化而失效", () => {
    const query = { topic: "智能家居" };
    expect(viralResearchQueryKey(query, "qwen-plus")).not.toBe(
      viralResearchQueryKey(query, "qwen3.7-plus"),
    );
    expect(viralResearchQueryKey(query, "qwen-plus")).toBe(
      viralResearchQueryKey(query, " QWEN-PLUS "),
    );
  });

  it("缓存 key 随目标平台、新鲜度和个性化上下文变化而失效", () => {
    const base = { topic: "智能家居" };
    const douyin = { ...base, targetPlatforms: ["douyin" as const] };
    const bilibili = { ...base, targetPlatforms: ["bilibili" as const] };
    expect(viralResearchQueryKey(douyin, "qwen-plus")).not.toBe(
      viralResearchQueryKey(bilibili, "qwen-plus"),
    );
    expect(
      viralResearchQueryKey(base, "qwen-plus", {
        freshnessDays: 7,
        contextFingerprint: "context-a",
      }),
    ).not.toBe(
      viralResearchQueryKey(base, "qwen-plus", {
        freshnessDays: 30,
        contextFingerprint: "context-a",
      }),
    );
    expect(
      viralResearchQueryKey(base, "qwen-plus", {
        freshnessDays: 7,
        contextFingerprint: "context-a",
      }),
    ).not.toBe(
      viralResearchQueryKey(base, "qwen-plus", {
        freshnessDays: 7,
        contextFingerprint: "context-b",
      }),
    );
  });

  it("强刷只移动索引，旧快照仍可读", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-research-"));
    const query = { topic: "智能家居" };
    const model = "qwen-plus";
    const firstFetchedAt = "2026-08-10T00:00:00.000Z";
    const first: ViralResearchSnapshot = {
      id: createViralResearchSnapshotId(query, model, firstFetchedAt, "first"),
      ownerId: "owner-a",
      query,
      provider: "dashscope-native-search",
      searchPerformed: true,
      fetchedAt: firstFetchedAt,
      expiresAt: "2026-08-11T00:00:00.000Z",
      items: [
        {
          id: "dash-1",
          sourceType: "dashscope",
          title: "网页来源一",
          url: "https://example.com/video/1",
          evidenceLevel: "public_source",
          relevanceReasons: [],
        },
      ],
      topicCards: [],
      commonPatterns: [],
      limitations: [],
      degradedReason: null,
    };
    await writeViralResearchSnapshot(first, {
      storageRoot: tempDir,
      cacheQuery: query,
      cacheModel: model,
    });

    const secondFetchedAt = "2026-08-10T01:00:00.000Z";
    const second = {
      ...first,
      id: createViralResearchSnapshotId(query, model, secondFetchedAt, "second"),
      fetchedAt: secondFetchedAt,
      expiresAt: "2026-08-11T01:00:00.000Z",
    };
    await writeViralResearchSnapshot(second, {
      storageRoot: tempDir,
      cacheQuery: query,
      cacheModel: model,
    });

    const current = await readCachedViralResearchSnapshot("owner-a", query, {
      storageRoot: tempDir,
      model,
    });
    const old = await readViralResearchSnapshot("owner-a", first.id, {
      storageRoot: tempDir,
    });
    expect(current?.id).toBe(second.id);
    expect(old?.id).toBe(first.id);
    expect(
      await readViralResearchSnapshot("owner-b", first.id, {
        storageRoot: tempDir,
      }),
    ).toBeNull();
    expect(
      isViralResearchSnapshotExpired(first, new Date("2026-08-11T00:00:00.000Z")),
    ).toBe(true);
    expect(
      await readCachedViralResearchSnapshot("owner-a", query, {
        storageRoot: tempDir,
        model: "qwen3.7-plus",
      }),
    ).toBeNull();
  });

  it("owner 目录只保留最近 30 个未被索引引用的快照", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-retention-"));
    const query = { topic: "快照保留" };
    const model = "qwen-plus";
    const ids: string[] = [];
    for (let index = 0; index < 34; index += 1) {
      const fetchedAt = new Date(
        Date.UTC(2026, 7, 10, 0, index, 0),
      ).toISOString();
      const snapshot: ViralResearchSnapshot = {
        id: createViralResearchSnapshotId(
          query,
          model,
          fetchedAt,
          `entropy-${index}`,
        ),
        ownerId: "owner-a",
        query,
        provider: "dashscope-native-search",
        searchPerformed: true,
        fetchedAt,
        expiresAt: fetchedAt,
        items: [],
        topicCards: [],
        commonPatterns: [],
        limitations: [],
        degradedReason: null,
      };
      ids.push(snapshot.id);
      await writeViralResearchSnapshot(snapshot, { storageRoot: tempDir });
    }
    const remaining = await Promise.all(
      ids.map((id) =>
        readViralResearchSnapshot("owner-a", id, { storageRoot: tempDir }),
      ),
    );
    expect(remaining.filter(Boolean).length).toBeLessThanOrEqual(30);
    expect(remaining.filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe("owner history percentile", () => {
  it("缺失指标不按 0 计分，依据只列实际可用分位", () => {
    const records = [
      record("a", "智能灯光 回家模式", {
        completionRate: 100,
        averageWatchSeconds: 60,
      }),
      record("b", "智能窗帘", {
        views: 0,
        completionRate: 0,
        averageWatchSeconds: 0,
      }),
      record("c", "安防摄像头", {
        views: 1_000,
        completionRate: 50,
        averageWatchSeconds: 30,
      }),
      record("d", "小红书直播起号流程", {
        views: 100_000,
        completionRate: 100,
        averageWatchSeconds: 120,
      }),
    ];
    const items = selectOwnedHistoryItems({ topic: "智能灯光" }, records, 3);
    const missingViews = items.find((item) => item.title.includes("回家模式"));
    expect(missingViews).toBeDefined();
    expect(missingViews?.accountFit?.reasons.join(" ")).toContain("完播率");
    expect(missingViews?.accountFit?.reasons.join(" ")).not.toContain("播放量处于");
    expect(items.some((item) => item.title.includes("直播起号"))).toBe(false);
  });
});

describe("viral research service", () => {
  it("filters future and expired web sources, then ranks fresh evidence before undated evidence", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-freshness-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: [
                {
                  index: 1,
                  title: "智能家居无日期案例",
                  url: "https://example.com/unknown",
                },
                {
                  index: 2,
                  title: "智能家居近期案例",
                  url: "https://example.com/fresh",
                  published_at: "2026-08-30T00:00:00.000Z",
                },
                {
                  index: 3,
                  title: "智能家居过期案例",
                  url: "https://example.com/old",
                  published_at: "2026-01-01T00:00:00.000Z",
                },
                {
                  index: 4,
                  title: "智能家居未来案例",
                  url: "https://example.com/future",
                  published_at: "2026-09-02T00:00:00.000Z",
                },
              ],
            },
            choices: [{ message: { content: "{}" } }],
          },
        }),
        { status: 200 },
      ),
    );
    const result = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" }, forceRefresh: true },
      {
        config: { dashscope: { ...runtimeConfig.dashscope, freshnessDays: 30 } },
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        now: () => new Date("2026-08-31T00:00:00.000Z"),
        ownedHistory: [],
      },
    );
    expect(result.snapshot.items.map((item) => item.url)).toEqual([
      "https://example.com/fresh",
      "https://example.com/unknown",
    ]);
  });

  it("invalidates a live cache entry when owner history or manual samples change", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-context-cache-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: [
                {
                  index: 1,
                  title: "智能家居联动实拍",
                  url: "https://example.com/context",
                },
              ],
            },
            choices: [{ message: { content: "{}" } }],
          },
        }),
        { status: 200 },
      ),
    );
    const sample = {
      id: "33333333-3333-4333-8333-333333333333",
      ownerId: "owner-a",
      url: "https://example.com/sample",
      title: "智能家居样本",
      platform: "douyin" as const,
      metricsSource: "manual" as const,
      visibleMetrics: { likes: 100 },
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    };
    const baseOptions = {
      config: runtimeConfig,
      fetchImpl: fetchImpl as typeof fetch,
      storageRoot: tempDir,
      now: () => new Date("2026-08-31T00:00:00.000Z"),
      ownedHistory: [
        record("h1", "智能家居", { views: 100, completionRate: 50 }),
      ],
      viralSamples: [sample],
    };
    const first = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      baseOptions,
    );
    const second = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      baseOptions,
    );
    const changed = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      {
        ...baseOptions,
        viralSamples: [
          { ...sample, visibleMetrics: { likes: 200 }, updatedAt: "2026-08-31T00:00:00.000Z" },
        ],
      },
    );
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(changed.cacheHit).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps every fallback topic-card source id inside the final snapshot items", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-card-integrity-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: Array.from({ length: 8 }, (_, index) => ({
                index: index + 1,
                title:
                  index >= 5
                    ? `智能家居末尾证明结构 ${index + 1}`
                    : `智能家居普通案例 ${index + 1}`,
                url: `https://example.com/card-${index + 1}`,
              })),
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    commonPatterns: ["末尾证明结构"],
                    topicCards: [],
                  }),
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const samples = Array.from({ length: 5 }, (_, index) => ({
      id: `44444444-4444-4444-8444-44444444444${index}`,
      ownerId: "owner-a",
      url: `https://sample.example.com/${index}`,
      title: `智能家居人工样本 ${index}`,
      platform: "douyin" as const,
      metricsSource: "manual" as const,
      visibleMetrics: { likes: 100 + index },
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    }));
    const result = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" }, forceRefresh: true },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        now: () => new Date("2026-08-31T00:00:00.000Z"),
        ownedHistory: [],
        viralSamples: samples,
      },
    );
    const itemIds = new Set(result.snapshot.items.map((item) => item.id));
    expect(result.snapshot.topicCards.length).toBeGreaterThan(0);
    expect(
      result.snapshot.topicCards.every((card) =>
        card.sourceIds.every((sourceId) => itemIds.has(sourceId)),
      ),
    ).toBe(true);
  });
  it("模型完全无法解析时不生成选题卡，只留人话局限", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-fallback-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: Array.from({ length: 3 }, (_, index) => ({
                index: index + 1,
                title: `智能家居案例 ${index + 1}`,
                url: `https://fallback-${index}.example.com/video`,
              })),
            },
            choices: [{ message: { content: "无法解析的模型输出" } }],
          },
        }),
        { status: 200 },
      ),
    );
    const result = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居 fallback" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        ownedHistory: [],
      },
    );
    expect(result.snapshot.topicCards).toEqual([]);
    expect(result.snapshot.commonPatterns).toEqual([]);
    expect(result.snapshot.limitations.length).toBeLessThanOrEqual(2);
    expect(result.snapshot.limitations.join("；")).toContain(
      "这次没整理出选题角度",
    );
  });

  it("单条来源即可产出选题卡，并按证据等级分级", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-single-source-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ...searchInfoFixture,
          output: {
            ...searchInfoFixture.output,
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    commonPatterns: ["先讲失败案例，再给可复核的对比画面"],
                    sourceJudgements: [
                      {
                        index: 1,
                        relevant: true,
                        kind: "platform_page",
                        reason: "抖音全屋智能实拍，与主题直接相关",
                      },
                      {
                        index: 5,
                        relevant: false,
                        kind: "generic_page",
                        reason: "财经内容与主题无关",
                      },
                    ],
                    topicCards: [
                      {
                        title: "回家一键场景到底怎么落地",
                        whyNow: "近期同类改造集中出现，热度未验证",
                        targetAudience: "准备装修的业主",
                        sourceIndexes: [1],
                        reusableStructures: ["结果前置"],
                        originalAngle: "用本地真实项目重新拍摄",
                        requiredEvidence: ["联动实拍"],
                        productionCost: "low",
                        risks: ["避免宣称绝对稳定"],
                      },
                    ],
                  }),
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const result = await researchViralVideos(
      "owner-a",
      { query: { topic: "全屋智能" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        ownedHistory: [],
      },
    );
    expect(result.snapshot.topicCards).toHaveLength(1);
    expect(result.snapshot.topicCards[0]?.sourceIds).toHaveLength(1);
    expect(result.snapshot.topicCards[0]?.title).toBe(
      "回家一键场景到底怎么落地",
    );
    expect(result.snapshot.topicCards[0]?.evidenceStrength).toBe(
      "platform_sourced",
    );
    expect(
      result.snapshot.items.some(
        (item) => item.evidenceLevel === "verified_metric",
      ),
    ).toBe(false);
    expect(result.snapshot.items.map((item) => item.evidenceLevel)).toContain(
      "media_article",
    );
    // 模型判定不相关的财经来源被丢弃。
    expect(
      result.snapshot.items.some((item) => item.url?.includes("finance")),
    ).toBe(false);
    expect(result.snapshot.limitations.length).toBeLessThanOrEqual(2);
    expect(result.snapshot.limitations.join("；")).toContain(
      "互动数据需要你自己点开核对",
    );
  });

  it("模型未给角度时用共性归纳兜底，且不改写标题", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-pattern-card-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: [
                { index: 1, title: "全屋净水配置对比", url: "https://example.com/1" },
                { index: 2, title: "净水器安装避坑", url: "https://example.com/2" },
                { index: 3, title: "软水机水垢实测", url: "https://example.com/3" },
                { index: 4, title: "家庭水质检测", url: "https://example.com/4" },
              ],
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    commonPatterns: [
                      "避坑式开场：先说错误配置，再展示水质和成本证据",
                      "实测式结构：展示水垢，再给出安装前后对比",
                    ],
                    topicCards: [],
                  }),
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const result = await researchViralVideos(
      "owner-a",
      { query: { topic: "全屋净水", region: "开远" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        ownedHistory: [],
      },
    );
    expect(result.snapshot.topicCards.length).toBeGreaterThan(0);
    expect(
      result.snapshot.topicCards.every(
        (card) =>
          !card.title.startsWith("资料候选｜") &&
          card.sourceIds.length >= 1 &&
          card.evidenceStrength === "weak",
      ),
    ).toBe(true);
    expect(result.snapshot.topicCards[0]?.requiredEvidence).toContain(
      "本地水质或水垢实测",
    );
    expect(result.snapshot.limitations.length).toBeLessThanOrEqual(2);
  });

  it("换模型后不复用旧缓存", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-model-key-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: [
                {
                  index: 1,
                  title: "智能家居联动实拍",
                  url: "https://example.com/model-key",
                },
              ],
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    commonPatterns: ["结果前置"],
                    topicCards: [],
                  }),
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const options = {
      fetchImpl: fetchImpl as typeof fetch,
      storageRoot: tempDir,
      ownedHistory: [],
      now: () => new Date("2026-08-10T00:00:00.000Z"),
    };
    const first = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      { ...options, config: runtimeConfig },
    );
    expect(first.cacheHit).toBe(false);
    const sameModel = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      { ...options, config: runtimeConfig },
    );
    expect(sameModel.cacheHit).toBe(true);

    const otherModel = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      {
        ...options,
        config: {
          dashscope: { ...runtimeConfig.dashscope, model: "qwen3-max" },
        },
      },
    );
    expect(otherModel.cacheHit).toBe(false);
    expect(otherModel.snapshot.id).not.toBe(first.snapshot.id);
  });

  it("DashScope 取得 3 个安全来源后才归纳共性并命中 72h 缓存", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-service-"));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: [1, 2, 3].map((index) => ({
                index,
                title: `智能家居案例 ${index}`,
                url: `https://example${index}.com/video`,
                site_name: `站点 ${index}`,
              })),
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    commonPatterns: ["先展示反常结果，再解释自动化逻辑"],
                    topicCards: [
                      {
                        title: "回家一秒全屋响应",
                        whyNow: "近期同类场景集中出现",
                        targetAudience: "装修业主",
                        sourceIndexes: [1, 2, 3],
                        reusableStructures: ["结果前置"],
                        originalAngle: "用本地真实项目重新拍摄",
                        requiredEvidence: ["联动实拍"],
                        productionCost: "low",
                        risks: ["避免宣称绝对稳定"],
                      },
                      {
                        title: "同一批来源换一个标题",
                        whyNow: "近期同类场景集中出现",
                        targetAudience: "装修业主",
                        sourceIndexes: [3, 2, 1],
                        reusableStructures: ["避坑开场"],
                        originalAngle: "换一种表达",
                        requiredEvidence: ["联动实拍"],
                        productionCost: "low",
                        risks: ["来源集合重复"],
                      },
                    ],
                  }),
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const history = [
      record("1", "智能家居 回家模式", {
        views: 1_000,
        completionRate: 50,
        averageWatchSeconds: 20,
      }),
      record("2", "智能灯光改造", {
        views: 2_000,
        completionRate: 60,
        averageWatchSeconds: 25,
      }),
      record("3", "全屋智能交付", {
        views: 3_000,
        completionRate: 70,
        averageWatchSeconds: 30,
      }),
    ];
    const now = new Date("2026-08-10T00:00:00.000Z");
    const first = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        now: () => now,
        ownedHistory: history,
      },
    );
    expect(first.cacheHit).toBe(false);
    expect(first.snapshot.commonPatterns).toEqual([
      "先展示反常结果，再解释自动化逻辑",
    ]);
    expect(first.snapshot.topicCards).toHaveLength(1);
    expect(first.snapshot.topicCards[0]?.sourceIds).toHaveLength(3);
    expect(first.snapshot.topicCards[0]?.title).toBe("回家一秒全屋响应");
    expect(first.snapshot.topicCards[0]?.evidenceStrength).toBe("weak");
    expect(first.snapshot.degradedReason).toBeNull();
    const requestCount = fetchImpl.mock.calls.length;

    const second = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        // 48h 后仍在 72h TTL 内。
        now: () => new Date("2026-08-12T00:00:00.000Z"),
        ownedHistory: history,
      },
    );
    expect(second.cacheHit).toBe(true);
    expect(second.snapshot.id).toBe(first.snapshot.id);
    expect(fetchImpl).toHaveBeenCalledTimes(requestCount);
  });

  it("缓存写入失败时仍返回实时检索结果", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-cache-fail-"));
    const blockedRoot = path.join(tempDir, "not-a-directory");
    await writeFile(blockedRoot, "block", "utf8");
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: [
                { index: 1, title: "智能家居案例一", url: "https://example.com/a" },
                { index: 2, title: "智能家居案例二", url: "https://example.com/b" },
                { index: 3, title: "智能家居案例三", url: "https://example.com/c" },
              ],
            },
            choices: [
              {
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    commonPatterns: ["结果前置再解释联动"],
                    topicCards: [],
                  }),
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居 cache-fail" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: blockedRoot,
        ownedHistory: [],
      },
    );

    expect(result.cacheHit).toBe(false);
    expect(result.snapshot.searchPerformed).toBe(true);
    expect(result.snapshot.items.length).toBeGreaterThanOrEqual(3);
    expect(result.snapshot.limitations.length).toBeLessThanOrEqual(2);
    // 技术性原因只进 degradedReason，不污染面向用户的 limitations。
    expect(result.snapshot.degradedReason ?? "").toContain("缓存写入失败");
  });
});
