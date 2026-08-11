import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultUserSettings } from "@/lib/settings/schema";
import { mergeProviderUpdate, saveUserSettings } from "@/lib/settings/store";
import {
  NATIVE_DASHSCOPE_RESEARCH_BASE_URL,
  describeWebResearchConfig,
  isCompatibleModeDashScopeUrl,
  normalizeWebResearchBlock,
  webResearchConfigIssues,
} from "@/lib/settings/web-research-config";

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

describe("web research config", () => {
  it("detects compatible-mode URL", () => {
    expect(
      isCompatibleModeDashScopeUrl(
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
      ),
    ).toBe(true);
    expect(
      isCompatibleModeDashScopeUrl("https://dashscope.aliyuncs.com/api/v1"),
    ).toBe(false);
  });

  it("normalizes compatible-mode URL to native API", () => {
    const settings = defaultUserSettings();
    settings.providers.webResearch.apiBaseUrl =
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
    const normalized = normalizeWebResearchBlock(settings.providers.webResearch);
    expect(normalized.apiBaseUrl).toBe(NATIVE_DASHSCOPE_RESEARCH_BASE_URL);
  });

  it("saveUserSettings persists normalized webResearch base URL", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "web-research-config-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");
    const settings = defaultUserSettings();
    settings.providers.dashscopeApiKey = "sk-test-key-12345678";
    settings.providers.webResearch.apiBaseUrl =
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
    await saveUserSettings(settings);
    const merged = mergeProviderUpdate(settings, defaultUserSettings());
    expect(merged.providers.webResearch.apiBaseUrl).toBe(
      NATIVE_DASHSCOPE_RESEARCH_BASE_URL,
    );
  });

  it("describeWebResearchConfig reports missing key", () => {
    const previous = process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    try {
      const settings = defaultUserSettings();
      settings.providers.webResearch.enabled = true;
      expect(webResearchConfigIssues(settings)).toContain(
        "未配置 Research Key，且无可复用的百炼 Key 或环境变量",
      );
      expect(describeWebResearchConfig(settings)).toContain("未配置");
    } finally {
      if (previous === undefined) delete process.env.DASHSCOPE_API_KEY;
      else process.env.DASHSCOPE_API_KEY = previous;
    }
  });

  it("describeWebResearchConfig reports ready when key is reused", () => {
    const settings = defaultUserSettings();
    settings.providers.dashscopeApiKey = "sk-test-key-12345678";
    settings.providers.webResearch.enabled = true;
    expect(webResearchConfigIssues(settings)).toEqual([]);
    expect(describeWebResearchConfig(settings)).toContain("复用百炼 Key");
  });
});
