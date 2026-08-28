import type { HotspotRuntimeConfigOverride } from "@/lib/hotspots/types";
import { hotspotConfigFromSettings } from "@/lib/settings/hotspot-config";
import { loadUserSettings } from "@/lib/settings/store";

export async function resolveHotspotConfig(): Promise<HotspotRuntimeConfigOverride> {
  return hotspotConfigFromSettings(await loadUserSettings());
}
