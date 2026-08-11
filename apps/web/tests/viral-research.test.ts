import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ImportedVideoRecord,
  ViralResearchItem,
  ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultUserSettings } from "@/lib/settings/schema";
import { selectOwnedHistoryItems } from "@/lib/viral-research/account-fit";
import {
  createViralResearchSnapshotId,
  isViralResearchSnapshotExpired,
  readCachedViralResearchSnapshot,
  readViralResearchSnapshot,
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

  it("发送原生 search_options 并使用安全过滤后的 search_info 作为来源", async () => {
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
                  url: "https://example.com/one?utm_source=test",
                  site_name: "案例站",
                  view_count: 12_345,
                  like_count: 678,
                },
                {
                  index: 2,
                  title: "智能灯光案例二",
                  url: "https://example.com/two",
                  site_name: "案例站",
                },
                {
                  index: 3,
                  title: "智能灯光案例三",
                  url: "https://example.com/three",
                  site_name: "案例站",
                },
                { index: 4, title: "不安全", url: "javascript:alert(1)" },
              ],
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    commonPatterns: ["前三秒用生活痛点建立冲突"],
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
      { topic: "智能灯光" },
      fetchImpl as typeof fetch,
    );
    expect(requestedUrl).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
    );
    const parameters = requestedBody.parameters as Record<string, unknown>;
    expect(parameters.enable_search).toBe(true);
    expect(parameters.result_format).toBe("message");
    expect(parameters.search_options).toMatchObject({
      forced_search: true,
      enable_source: true,
      freshness: 30,
      search_strategy: "max",
    });
    const input = requestedBody.input as {
      messages: Array<{ content: string }>;
    };
    expect(input.messages[0]?.content).toContain(
      "只检索行业、装修、家庭生活、新品技术等相关内容",
    );
    expect(input.messages[0]?.content).toContain(
      "排除时政、灾难、社会争议",
    );
    expect(result.searchPerformed).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.url).toBe("https://example.com/one");
    expect(result.items[0]?.evidenceLevel).toBe("verified_metric");
    expect(result.items[0]?.visibleMetrics).toMatchObject({
      views: 12_345,
      likes: 678,
    });
    expect(result.analysis?.commonPatterns).toEqual(["前三秒用生活痛点建立冲突"]);
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
    expect(multimodalBody.parameters.search_options).toMatchObject({
      search_strategy: "agent",
      enable_source: true,
      prepend_search_result: true,
      freshness: 30,
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
  it("强刷只移动索引，旧快照仍可读", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-research-"));
    const query = { topic: "智能家居" };
    const firstFetchedAt = "2026-08-10T00:00:00.000Z";
    const first: ViralResearchSnapshot = {
      id: createViralResearchSnapshotId(query, firstFetchedAt, "first"),
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
    });

    const secondFetchedAt = "2026-08-10T01:00:00.000Z";
    const second = {
      ...first,
      id: createViralResearchSnapshotId(query, secondFetchedAt, "second"),
      fetchedAt: secondFetchedAt,
      expiresAt: "2026-08-11T01:00:00.000Z",
    };
    await writeViralResearchSnapshot(second, {
      storageRoot: tempDir,
      cacheQuery: query,
    });

    const current = await readCachedViralResearchSnapshot("owner-a", query, {
      storageRoot: tempDir,
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
  it("模型未返回合格角度时不再用同一批来源补足三张兜底卡", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "viral-fallback-"));
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      const count = call === 1 ? 3 : 2;
      return new Response(
        JSON.stringify({
          output: {
            search_info: {
              search_results: Array.from({ length: count }, (_, index) => ({
                index: index + 1,
                title: `智能家居案例 ${index + 1}`,
                url: `https://fallback${call}-${index}.example.com/video`,
              })),
            },
            choices: [
              {
                message: {
                  content:
                    call === 1
                      ? "无法解析的模型输出"
                      : JSON.stringify({
                          commonPatterns: ["不应在两个来源时采用"],
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
    const enough = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居 fallback" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        ownedHistory: [],
      },
    );
    expect(enough.snapshot.topicCards).toEqual([]);
    expect(enough.snapshot.limitations.join("；")).toContain(
      "模型未返回由至少 3 条主题相关来源共同支撑的选题角度",
    );
    expect(enough.snapshot.commonPatterns).toEqual([]);

    const insufficient = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居 insufficient" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        ownedHistory: [],
      },
    );
    expect(insufficient.snapshot.topicCards).toEqual([]);
    expect(insufficient.snapshot.limitations.join("；")).toContain(
      "主题相关且可追溯的独立外部来源少于 3 个，未生成选题卡。",
    );
    expect(insufficient.snapshot.commonPatterns).toEqual([
      "不应在两个来源时采用",
    ]);
  });

  it("有至少 3 条相关资料和共性时生成明确降级的资料型角度", async () => {
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
          card.title.startsWith("资料候选｜") && card.sourceIds.length === 3,
      ),
    ).toBe(true);
    expect(result.snapshot.limitations.join("；")).toContain("资料型候选");
  });

  it("DashScope 取得 3 个安全来源后才归纳共性并命中 24h 缓存", async () => {
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
    expect(first.snapshot.topicCards[0]?.title).toBe(
      "资料候选｜回家一秒全屋响应",
    );
    expect(first.snapshot.degradedReason).toBeNull();
    const requestCount = fetchImpl.mock.calls.length;

    const second = await researchViralVideos(
      "owner-a",
      { query: { topic: "智能家居" } },
      {
        config: runtimeConfig,
        fetchImpl: fetchImpl as typeof fetch,
        storageRoot: tempDir,
        now: () => new Date("2026-08-10T23:59:59.000Z"),
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
    expect(result.snapshot.limitations.join("；")).toContain("缓存写入失败");
  });
});
