import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyHotspotEnvironment } from "@/lib/hotspots/config";
import {
  describeHotspotConfig,
  hotspotConfigFromSettings,
  hotspotConfigIssues,
  normalizeHotspotBlock,
  normalizeRsshubBaseUrl,
} from "@/lib/settings/hotspot-config";
import {
  defaultUserSettings,
  type HotspotSourceSetting,
  type UserSettings,
} from "@/lib/settings/schema";
import {
  loadUserSettings,
  maskUserSettings,
  mergeProviderUpdate,
  saveUserSettings,
} from "@/lib/settings/store";
import { allTrackIds } from "@/lib/tracks/dictionary";

const previousPath = process.env.USER_SETTINGS_PATH;
let tempDir: string | undefined;

afterEach(async () => {
  if (previousPath === undefined) delete process.env.USER_SETTINGS_PATH;
  else process.env.USER_SETTINGS_PATH = previousPath;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function source(
  overrides: Partial<HotspotSourceSetting> & { id: string },
): HotspotSourceSetting {
  return {
    name: overrides.id,
    url: `https://example.com/${overrides.id}.xml`,
    kind: "rss",
    enabled: true,
    ...overrides,
  };
}

function settingsWith(
  hotspots: Partial<UserSettings["providers"]["hotspots"]>,
): UserSettings {
  const settings = defaultUserSettings();
  settings.providers.hotspots = {
    ...settings.providers.hotspots,
    ...hotspots,
  };
  return settings;
}

describe("normalizeRsshubBaseUrl", () => {
  it("去掉尾斜杠、查询串与凭据", () => {
    expect(normalizeRsshubBaseUrl("  https://rsshub.example.com/  ")).toBe(
      "https://rsshub.example.com",
    );
    expect(normalizeRsshubBaseUrl("http://127.0.0.1:1200/?token=abc")).toBe(
      "http://127.0.0.1:1200",
    );
    expect(normalizeRsshubBaseUrl("http://user:pass@127.0.0.1:1200")).toBe(
      "http://127.0.0.1:1200",
    );
  });

  it("非 http(s) 协议与非法地址归空", () => {
    expect(normalizeRsshubBaseUrl("ftp://rsshub.example.com")).toBe("");
    expect(normalizeRsshubBaseUrl("javascript:alert(1)")).toBe("");
    expect(normalizeRsshubBaseUrl("rsshub.example.com")).toBe("");
    expect(normalizeRsshubBaseUrl("   ")).toBe("");
  });
});

describe("applyHotspotEnvironment", () => {
  it("设置未填写时使用环境变量中的 RSSHub 地址", () => {
    expect(
      applyHotspotEnvironment(
        { rsshubBaseUrl: "" },
        { HOTSPOT_RSSHUB_BASE_URL: "http://127.0.0.1:1200/" },
      ).rsshubBaseUrl,
    ).toBe("http://127.0.0.1:1200");
  });

  it("手工设置优先，非法环境地址不生效", () => {
    expect(
      applyHotspotEnvironment(
        { rsshubBaseUrl: "https://rsshub.example.com" },
        { HOTSPOT_RSSHUB_BASE_URL: "http://127.0.0.1:1200" },
      ).rsshubBaseUrl,
    ).toBe("https://rsshub.example.com");
    expect(
      applyHotspotEnvironment(
        { rsshubBaseUrl: "" },
        { HOTSPOT_RSSHUB_BASE_URL: "javascript:alert(1)" },
      ).rsshubBaseUrl,
    ).toBe("");
  });
});

describe("normalizeHotspotBlock", () => {
  it("自定义主题词去空白、忽略大小写去重并保留 emoji", () => {
    const normalized = normalizeHotspotBlock(
      settingsWith({
        customKeywords: ["  AI 教育  ", "ai 教育", "宠物 🐱", "宠物 🐱"],
      }).providers.hotspots,
    );
    expect(normalized.customKeywords).toEqual(["AI 教育", "宠物 🐱"]);
  });

  it("重复源 id 只保留第一条", () => {
    const normalized = normalizeHotspotBlock(
      settingsWith({
        sources: [
          source({ id: "ithome", name: "IT之家" }),
          source({ id: "ithome", name: "IT之家（重复）" }),
          source({ id: "36kr", name: "36氪" }),
        ],
      }).providers.hotspots,
    );
    expect(normalized.sources.map((item) => item.id)).toEqual([
      "ithome",
      "36kr",
    ]);
    expect(normalized.sources[0]?.name).toBe("IT之家");
  });

  it("trackIds 为空时回落到全部赛道，并去重", () => {
    expect(
      normalizeHotspotBlock(settingsWith({ trackIds: [] }).providers.hotspots)
        .trackIds,
    ).toEqual(allTrackIds());
    expect(
      normalizeHotspotBlock(
        settingsWith({ trackIds: ["water", "water", "smart_home"] }).providers
          .hotspots,
      ).trackIds,
    ).toEqual(["water", "smart_home"]);
  });

  it("配置自定义主题词时允许 trackIds 为空", () => {
    const normalized = normalizeHotspotBlock(
      settingsWith({ trackIds: [], customKeywords: ["AI 教育"] }).providers
        .hotspots,
    );
    expect(normalized.trackIds).toEqual([]);
    expect(normalized.customKeywords).toEqual(["AI 教育"]);
    expect(
      hotspotConfigIssues(
        settingsWith({ trackIds: [], customKeywords: ["AI 教育"] }),
      ),
    ).toEqual([]);
  });

  it("归一化 RSSHub 地址并 trim topicModel", () => {
    const normalized = normalizeHotspotBlock(
      settingsWith({
        rsshubBaseUrl: "https://rsshub.example.com/?token=x",
        topicModel: "  qwen-plus  ",
      }).providers.hotspots,
    );
    expect(normalized.rsshubBaseUrl).toBe("https://rsshub.example.com");
    expect(normalized.topicModel).toBe("qwen-plus");
  });
});

describe("hotspotConfigIssues", () => {
  it("未启用时只报未启用", () => {
    expect(hotspotConfigIssues(settingsWith({ enabled: false }))).toEqual([
      "热点研究未启用",
    ]);
    expect(describeHotspotConfig(settingsWith({ enabled: false }))).toBe(
      "未启用热点研究",
    );
  });

  it("默认设置（源清单为空）视为就绪", () => {
    const settings = defaultUserSettings();
    expect(hotspotConfigIssues(settings)).toEqual([]);
    expect(describeHotspotConfig(settings)).toContain("已就绪");
    expect(describeHotspotConfig(settings)).toContain("内置默认");
  });

  it("RSSHub 地址非法时给出提示", () => {
    expect(
      hotspotConfigIssues(settingsWith({ rsshubBaseUrl: "ftp://bad.example" })),
    ).toContain("RSSHub 地址无效，必须是 http(s) 地址");
  });

  it("启用了 rsshub 源但未填地址时提示会被跳过", () => {
    const issues = hotspotConfigIssues(
      settingsWith({
        sources: [source({ id: "weibo", kind: "rsshub", url: "/weibo/search/hot" })],
      }),
    );
    expect(issues).toContain(
      "启用了 RSSHub 源但未填写 RSSHub 地址，这些源会被跳过",
    );
  });

  it("填了 RSSHub 地址后 rsshub 源不再报问题", () => {
    expect(
      hotspotConfigIssues(
        settingsWith({
          rsshubBaseUrl: "http://127.0.0.1:1200",
          sources: [
            source({ id: "weibo", kind: "rsshub", url: "/weibo/search/hot" }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("配置了源但全部停用时提示", () => {
    const issues = hotspotConfigIssues(
      settingsWith({
        sources: [
          source({ id: "ithome", enabled: false }),
          source({ id: "36kr", enabled: false }),
        ],
      }),
    );
    expect(issues).toContain("所有热点源都已停用");
  });

  it("赛道留空会被归一化补全，因此不报赛道问题", () => {
    // 归一化阶段就把空赛道回落成全选，「未选择任何赛道」在当前 schema 下不可达。
    const issues = hotspotConfigIssues(settingsWith({ trackIds: [] }));
    expect(issues).not.toContain("未选择任何赛道");
    expect(issues).toEqual([]);
  });
});

describe("hotspotConfigFromSettings", () => {
  it("源清单为空时不下发 sources，由服务侧回落内置默认", () => {
    const config = hotspotConfigFromSettings(defaultUserSettings());
    expect("sources" in config).toBe(false);
    expect(config.enabled).toBe(true);
    expect(config.trackIds).toEqual(allTrackIds());
  });

  it("topicModel 映射到 llm.model，其余数值原样下发", () => {
    const config = hotspotConfigFromSettings(
      settingsWith({
        topicModel: " qwen-max ",
        freshnessDays: 3,
        maxItemsPerSource: 30,
        rsshubBaseUrl: "http://127.0.0.1:1200/",
        sources: [source({ id: "ithome" })],
      }),
    );
    expect(config.llm?.model).toBe("qwen-max");
    expect(config.freshnessDays).toBe(3);
    expect(config.maxItemsPerSource).toBe(30);
    expect(config.rsshubBaseUrl).toBe("http://127.0.0.1:1200");
    expect(config.sources?.map((item) => item.id)).toEqual(["ithome"]);
  });

  it("自定义主题词和账号定位进入热点运行时配置", () => {
    const settings = settingsWith({
      customKeywords: ["  AI 教育 ", "ai 教育", "宠物 🐱"],
    });
    settings.contentProfile.positioning = "  面向新手家长的 AI 学习账号  ";
    settings.contentProfile.themeKeywords = ["AI 亲子教育"];

    const config = hotspotConfigFromSettings(settings);

    expect(config.customKeywords).toEqual([
      "AI 亲子教育",
      "AI 教育",
      "宠物 🐱",
    ]);
    expect(config.accountPositioning).toContain("定位：面向新手家长的 AI 学习账号");
    expect(config.accountPositioning).toContain("受众：");
  });
});

describe("热点设置读写往返", () => {
  it("mergeProviderUpdate 保留其它 provider 密钥，热点源按整体替换", () => {
    const current = defaultUserSettings();
    current.providers.dashscopeApiKey = "sk-real-key-1234";
    current.providers.webResearch.apiKey = "sk-real-research-2345";
    current.providers.hotspots.sources = [
      source({ id: "ithome" }),
      source({ id: "36kr" }),
    ];

    const patch = maskUserSettings(current);
    patch.providers.hotspots = {
      ...patch.providers.hotspots,
      rsshubBaseUrl: "http://127.0.0.1:1200/",
      freshnessDays: 3,
      sources: [source({ id: "geekpark" })],
    };

    const merged = mergeProviderUpdate(current, patch);
    expect(merged.providers.dashscopeApiKey).toBe("sk-real-key-1234");
    expect(merged.providers.webResearch.apiKey).toBe("sk-real-research-2345");
    expect(merged.providers.hotspots.sources.map((item) => item.id)).toEqual([
      "geekpark",
    ]);
    expect(merged.providers.hotspots.rsshubBaseUrl).toBe("http://127.0.0.1:1200");
    expect(merged.providers.hotspots.freshnessDays).toBe(3);
  });

  it("保存后读回热点块并保持归一化结果", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "hotspot-settings-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");

    const settings = defaultUserSettings();
    settings.providers.hotspots.rsshubBaseUrl = "http://127.0.0.1:1200/?token=x";
    settings.providers.hotspots.topicModel = " qwen-plus ";
    settings.providers.hotspots.trackIds = [];
    settings.providers.hotspots.sources = [
      source({ id: "ithome" }),
      source({ id: "ithome", name: "重复" }),
    ];
    await saveUserSettings(settings);

    const loaded = await loadUserSettings();
    expect(loaded.providers.hotspots.rsshubBaseUrl).toBe("http://127.0.0.1:1200");
    expect(loaded.providers.hotspots.topicModel).toBe("qwen-plus");
    expect(loaded.providers.hotspots.trackIds).toEqual(allTrackIds());
    expect(loaded.providers.hotspots.sources).toHaveLength(1);
  });
});
