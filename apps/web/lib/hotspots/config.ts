import type { HotspotRuntimeConfigOverride } from "@/lib/hotspots/types";
import {
  hotspotConfigFromSettings,
  normalizeRsshubBaseUrl,
} from "@/lib/settings/hotspot-config";
import { loadUserSettings } from "@/lib/settings/store";

export function applyHotspotEnvironment(
  config: HotspotRuntimeConfigOverride,
  environment: Record<string, string | undefined> = process.env,
): HotspotRuntimeConfigOverride {
  if (config.rsshubBaseUrl) return config;
  const rsshubBaseUrl = normalizeRsshubBaseUrl(
    environment.HOTSPOT_RSSHUB_BASE_URL ?? "",
  );
  return rsshubBaseUrl ? { ...config, rsshubBaseUrl } : config;
}

export async function resolveHotspotConfig(): Promise<HotspotRuntimeConfigOverride> {
  return applyHotspotEnvironment(
    hotspotConfigFromSettings(await loadUserSettings()),
  );
}
