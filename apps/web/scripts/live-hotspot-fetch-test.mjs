import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(root, ".."));
process.env.USER_SETTINGS_PATH = path.join(process.cwd(), ".data", "user-settings.json");

const { resolveHotspotConfig } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/hotspots/config.ts")).href
);
const { researchHotspots } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/hotspots/service.ts")).href
);
const { describeHotspotConfig } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/settings/hotspot-config.ts")).href
);
const { loadUserSettings } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/settings/store.ts")).href
);

const settings = await loadUserSettings();
const config = await resolveHotspotConfig();

console.log("=== Hotspot settings ===");
console.log(describeHotspotConfig(settings));
console.log({
  enabled: config.enabled,
  rsshubBaseUrl: config.rsshubBaseUrl || "(empty)",
  trackIds: config.trackIds,
  sourceCount: config.sources?.length ?? "default",
});

console.log("\n=== researchHotspots (full service) ===");
const startedAt = Date.now();
const result = await researchHotspots(
  "live-hotspot-test-owner",
  { forceRefresh: true },
  { config },
);
const snapshot = result.snapshot;
console.log({
  elapsedMs: Date.now() - startedAt,
  cacheHit: result.cacheHit,
  stale: result.stale,
  itemCount: snapshot.items.length,
  clusterCount: snapshot.clusters.length,
  topicCardCount: snapshot.topicCards.length,
  sourceReports: snapshot.sourceReports.map((report) => ({
    id: report.sourceId,
    status: report.status,
    itemCount: report.itemCount,
    message: report.message,
  })),
  limitations: snapshot.limitations,
  degradedReason: snapshot.degradedReason ?? null,
  sampleTitles: snapshot.items.slice(0, 5).map((item) => item.title),
});

const okSources = snapshot.sourceReports.filter((report) => report.status === "ok").length;
process.exit(okSources > 0 || snapshot.items.length > 0 ? 0 : 1);
