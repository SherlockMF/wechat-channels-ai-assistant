import { resolvePrimaryApiKey } from "@/lib/settings/credentials";
import type { UserSettings } from "@/lib/settings/schema";
import { loadUserSettings } from "@/lib/settings/store";
import { normalizeWebResearchBlock } from "@/lib/settings/web-research-config";
import type { ViralResearchRuntimeConfig } from "@/lib/viral-research/types";

function officialHttpsBaseUrl(value: string, hostname: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== hostname) return value.trim();
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return value.trim();
  }
}

function isOfficialHttpsHost(value: string, hostname: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname;
  } catch {
    return false;
  }
}

export function viralResearchConfigFromSettings(
  settings: UserSettings,
): ViralResearchRuntimeConfig {
  const webResearch = normalizeWebResearchBlock(settings.providers.webResearch);
  const dashscopeBaseUrl = officialHttpsBaseUrl(
    webResearch.apiBaseUrl,
    "dashscope.aliyuncs.com",
  );
  const canReuseDashScopeKey = isOfficialHttpsHost(
    dashscopeBaseUrl,
    "dashscope.aliyuncs.com",
  );
  return {
    dashscope: {
      enabled: webResearch.enabled,
      apiKey:
        webResearch.apiKey.trim() ||
        (canReuseDashScopeKey ? resolvePrimaryApiKey("webResearch") : ""),
      apiBaseUrl: dashscopeBaseUrl,
      model: webResearch.model.trim() || "qwen-plus",
      freshnessDays: webResearch.freshnessDays,
    },
  };
}

export async function resolveViralResearchConfig(): Promise<ViralResearchRuntimeConfig> {
  return viralResearchConfigFromSettings(await loadUserSettings());
}
