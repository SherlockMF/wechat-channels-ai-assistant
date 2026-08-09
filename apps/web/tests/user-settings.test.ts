import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    base.setupCompleted = true;
    await saveUserSettings(base);

    const loaded = await loadUserSettings();
    expect(loaded.providers.dashscopeApiKey).toBe("sk-test-secret-key-9999");
    expect(loaded.setupCompleted).toBe(true);

    const raw = await readFile(process.env.USER_SETTINGS_PATH, "utf8");
    expect(raw).toContain("sk-test-secret-key-9999");
  });

  it("maskUserSettings 脱敏密钥", () => {
    const settings = defaultUserSettings();
    settings.providers.dashscopeApiKey = "sk-abcdefghijklmn";
    const masked = maskUserSettings(settings);
    expect(masked.providers.dashscopeApiKey).not.toContain("abcdef");
    expect(masked.providers.dashscopeApiKey.endsWith("klmn")).toBe(true);
  });

  it("mergeProviderUpdate 保留被脱敏的旧密钥", () => {
    const current = defaultUserSettings();
    current.providers.dashscopeApiKey = "sk-real-key-1234";
    const patch = maskUserSettings(current);
    patch.setupCompleted = true;
    const merged = mergeProviderUpdate(current, patch);
    expect(merged.providers.dashscopeApiKey).toBe("sk-real-key-1234");
    expect(merged.setupCompleted).toBe(true);
  });
});
