import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultUserSettings } from "@/lib/settings/schema";
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
    base.setupCompleted = true;
    await saveUserSettings(base);

    const loaded = await loadUserSettings();
    expect(loaded.providers.dashscopeApiKey).toBe("sk-test-secret-key-9999");
    expect(loaded.providers.webResearch.apiKey).toBe("sk-research-key-8888");
    expect(loaded.providers.webResearch.freshnessDays).toBe(30);
    expect(loaded.setupCompleted).toBe(true);
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
    const merged = mergeProviderUpdate(current, patch);
    expect(merged.providers.dashscopeApiKey).toBe("sk-real-key-1234");
    expect(merged.providers.webResearch.apiKey).toBe("sk-real-research-2345");
    expect(merged.setupCompleted).toBe(true);
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
