import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultUserSettings } from "@/lib/settings/schema";
import { normalizeContentProfile } from "@/lib/settings/content-profile";
import {
  PLATFORM_CATALOG,
  platformPromptGuidance,
} from "@/lib/platforms/catalog";
import {
  loadUserSettings,
  maskSecret,
  maskUserSettings,
  mergeProviderUpdate,
  saveUserSettings,
  settingsPath,
} from "@/lib/settings/store";
import { NATIVE_DASHSCOPE_RESEARCH_BASE_URL } from "@/lib/settings/web-research-config";

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

describe("user settings store", () => {
  it("旧设置自动得到可用的默认账号画像", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "user-settings-profile-default-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");
    await writeFile(
      process.env.USER_SETTINGS_PATH,
      JSON.stringify({ providers: {} }),
      "utf8",
    );

    const loaded = await loadUserSettings();
    expect(loaded.contentProfile.brandName).toBe("恒远");
    expect(loaded.contentProfile.defaultPlatforms).toEqual(["weixin_channels"]);
  });

  it("账号画像会去空白、去重并保留合法平台", () => {
    const normalized = normalizeContentProfile({
      accountName: "  新账号  ",
      brandName: "  新品牌 ",
      region: " 杭州 ",
      positioning: " 家居测评 ",
      audiences: [" 新房业主 ", "新房业主", "", "租房人群"],
      toneGuide: " 真诚、清楚 ",
      ctaPolicy: " 不强推私信 ",
      themeKeywords: [" 净水 ", "净水", "全屋智能", ""],
      defaultPlatforms: ["douyin", "douyin", "xiaohongshu"],
      otherPlatformName: "  自建社区 ",
    });

    expect(normalized.accountName).toBe("新账号");
    expect(normalized.audiences).toEqual(["新房业主", "租房人群"]);
    expect(normalized.themeKeywords).toEqual(["净水", "全屋智能"]);
    expect(normalized.defaultPlatforms).toEqual(["douyin", "xiaohongshu"]);
    expect(normalized.otherPlatformName).toBe("自建社区");
  });

  it("平台目录覆盖 8 个目标且明确当前手工能力边界", () => {
    expect(PLATFORM_CATALOG).toHaveLength(8);
    expect(new Set(PLATFORM_CATALOG.map((item) => item.id)).size).toBe(8);
    expect(PLATFORM_CATALOG.every((item) => item.capabilities.autoPublish === false)).toBe(true);
    expect(PLATFORM_CATALOG.every((item) => item.capabilities.metricSync === false)).toBe(true);
    expect(platformPromptGuidance(["youtube_shorts"])).toContain("YouTube Shorts");
  });

  it("maskSecret 只保留末 4 位", () => {
    expect(maskSecret("sk-abcdefghijklmn")).toMatch(/mn$/u);
    expect(maskSecret("sk-abcdefghijklmn")).toContain("*");
    expect(maskSecret("")).toBe("");
  });

  it("保存后可读回，且路径尊重 USER_SETTINGS_PATH", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "user-settings-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");
    expect(settingsPath()).toBe(process.env.USER_SETTINGS_PATH);

    const base = defaultUserSettings();
    base.providers.dashscopeApiKey = "sk-test-secret-key-9999";
    base.providers.webResearch.apiKey = "sk-research-key-8888";
    base.contentProfile = normalizeContentProfile({
      ...base.contentProfile,
      accountName: "杭州租房研究所",
      brandName: "住得好",
      region: "杭州",
      defaultPlatforms: ["xiaohongshu", "douyin"],
    });
    base.setupCompleted = true;
    await saveUserSettings(base);

    const loaded = await loadUserSettings();
    expect(loaded.providers.dashscopeApiKey).toBe("sk-test-secret-key-9999");
    expect(loaded.providers.webResearch.apiKey).toBe("sk-research-key-8888");
    expect(loaded.providers.webResearch.freshnessDays).toBe(30);
    expect(loaded.setupCompleted).toBe(true);
    expect(loaded.contentProfile.accountName).toBe("杭州租房研究所");
    expect(loaded.contentProfile.defaultPlatforms).toEqual([
      "xiaohongshu",
      "douyin",
    ]);
    expect(
      (loaded.providers as { douyin?: unknown }).douyin,
    ).toBeUndefined();

    const raw = await readFile(process.env.USER_SETTINGS_PATH, "utf8");
    expect(raw).toContain("sk-test-secret-key-9999");
  });

  it("maskUserSettings 脱敏密钥", () => {
    const settings = defaultUserSettings();
    settings.providers.dashscopeApiKey = "sk-abcdefghijklmn";
    settings.providers.webResearch.apiKey = "sk-research-abcdefghijkl";
    const masked = maskUserSettings(settings);
    expect(masked.providers.dashscopeApiKey).not.toContain("abcdef");
    expect(masked.providers.dashscopeApiKey.endsWith("klmn")).toBe(true);
    expect(masked.providers.webResearch.apiKey).not.toContain("research");
  });

  it("mergeProviderUpdate 保留被脱敏的旧密钥", () => {
    const current = defaultUserSettings();
    current.providers.dashscopeApiKey = "sk-real-key-1234";
    current.providers.webResearch.apiKey = "sk-real-research-2345";
    const patch = maskUserSettings(current);
    patch.setupCompleted = true;
    patch.contentProfile = normalizeContentProfile({
      ...patch.contentProfile,
      accountName: "新账号",
      defaultPlatforms: ["douyin"],
    });
    const merged = mergeProviderUpdate(current, patch);
    expect(merged.providers.dashscopeApiKey).toBe("sk-real-key-1234");
    expect(merged.providers.webResearch.apiKey).toBe("sk-real-research-2345");
    expect(merged.setupCompleted).toBe(true);
    expect(merged.contentProfile.accountName).toBe("新账号");
    expect(merged.contentProfile.defaultPlatforms).toEqual(["douyin"]);
  });

  it("保存后可读回模型字段", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "user-settings-models-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");
    const base = defaultUserSettings();
    base.providers.speech.model = "qwen-audio-3.0-asr-flash";
    base.providers.vision.model = "qwen-vl-plus";
    base.providers.llm.model = "qwen-plus";
    base.providers.webResearch.model = "qwen-plus";
    await saveUserSettings(base);

    const loaded = await loadUserSettings();
    expect(loaded.providers.speech.model).toBe("qwen-audio-3.0-asr-flash");
    expect(loaded.providers.vision.model).toBe("qwen-vl-plus");
    expect(loaded.providers.llm.model).toBe("qwen-plus");
    expect(loaded.providers.webResearch.model).toBe("qwen-plus");
  });

  it("loadUserSettings 读取时会规范化 webResearch Base URL", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "user-settings-normalize-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");
    const base = defaultUserSettings();
    base.providers.dashscopeApiKey = "sk-test-key-12345678";
    base.providers.webResearch.apiBaseUrl =
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
    await writeFile(
      process.env.USER_SETTINGS_PATH,
      `${JSON.stringify(base, null, 2)}\n`,
      "utf8",
    );

    const loaded = await loadUserSettings();
    expect(loaded.providers.webResearch.apiBaseUrl).toBe(
      NATIVE_DASHSCOPE_RESEARCH_BASE_URL,
    );
  });
});
