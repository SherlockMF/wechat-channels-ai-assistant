import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHotspotBlock } from "@/lib/settings/hotspot-config";
import {
  defaultUserSettings,
  userSettingsSchema,
  type UserSettings,
} from "@/lib/settings/schema";
import { normalizeUserSettingsProviders } from "@/lib/settings/web-research-config";

function normalizeProviders(
  providers: UserSettings["providers"],
): UserSettings["providers"] {
  const normalized = normalizeUserSettingsProviders(providers);
  return {
    ...normalized,
    hotspots: normalizeHotspotBlock(normalized.hotspots),
  };
}

export function settingsPath(): string {
  const fromEnv = process.env.USER_SETTINGS_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), ".data", "user-settings.json");
}

function parseSettingsJson(raw: string): UserSettings {
  const parsed = userSettingsSchema.parse(JSON.parse(raw) as unknown);
  return {
    ...parsed,
    providers: normalizeProviders(parsed.providers),
  };
}

export function loadUserSettingsSync(): UserSettings {
  try {
    return parseSettingsJson(readFileSync(settingsPath(), "utf8"));
  } catch {
    return defaultUserSettings();
  }
}

export async function loadUserSettings(): Promise<UserSettings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return parseSettingsJson(raw);
  } catch {
    return defaultUserSettings();
  }
}

export async function saveUserSettings(
  next: UserSettings,
): Promise<UserSettings> {
  const parsed = userSettingsSchema.parse({
    ...next,
    providers: normalizeProviders(next.providers),
  });
  const filePath = settingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "****";
  return `${"*".repeat(Math.min(12, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

export function maskUserSettings(settings: UserSettings): UserSettings {
  return {
    ...settings,
    providers: {
      ...settings.providers,
      dashscopeApiKey: maskSecret(settings.providers.dashscopeApiKey),
      speech: {
        ...settings.providers.speech,
        apiKey: maskSecret(settings.providers.speech.apiKey),
      },
      vision: {
        ...settings.providers.vision,
        apiKey: maskSecret(settings.providers.vision.apiKey),
      },
      llm: {
        ...settings.providers.llm,
        apiKey: maskSecret(settings.providers.llm.apiKey),
      },
      webResearch: {
        ...settings.providers.webResearch,
        apiKey: maskSecret(settings.providers.webResearch.apiKey),
      },
    },
  };
}

/** Merge PUT body: empty/masked key fields keep previous secrets. */
export function mergeProviderUpdate(
  current: UserSettings,
  patch: UserSettings,
): UserSettings {
  const keepKey = (incoming: string, previous: string) => {
    const value = incoming.trim();
    if (!value) return previous;
    if (value.includes("*")) return previous;
    return value;
  };

  return userSettingsSchema.parse({
    setupCompleted: patch.setupCompleted,
    dismissWizard: patch.dismissWizard,
    providers: normalizeProviders({
      dashscopeApiKey: keepKey(
        patch.providers.dashscopeApiKey,
        current.providers.dashscopeApiKey,
      ),
      dashscopeApiBaseUrl:
        patch.providers.dashscopeApiBaseUrl.trim() ||
        current.providers.dashscopeApiBaseUrl,
      speech: {
        ...patch.providers.speech,
        apiKey: keepKey(
          patch.providers.speech.apiKey,
          current.providers.speech.apiKey,
        ),
      },
      vision: {
        ...patch.providers.vision,
        apiKey: keepKey(
          patch.providers.vision.apiKey,
          current.providers.vision.apiKey,
        ),
      },
      llm: {
        ...patch.providers.llm,
        apiKey: keepKey(
          patch.providers.llm.apiKey,
          current.providers.llm.apiKey,
        ),
      },
      webResearch: {
        ...patch.providers.webResearch,
        apiKey: keepKey(
          patch.providers.webResearch.apiKey,
          current.providers.webResearch.apiKey,
        ),
      },
      /** 热点块没有密钥字段，源清单按整体替换语义直接采用请求值。 */
      hotspots: patch.providers.hotspots,
    }),
  });
}
