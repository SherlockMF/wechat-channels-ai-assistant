import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(root, ".."));
process.env.USER_SETTINGS_PATH = path.join(process.cwd(), ".data", "user-settings.json");

const { resolveViralResearchConfig } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/viral-research/config.ts")).href
);
const { searchDashScope } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/viral-research/dashscope.ts")).href
);
const { researchViralVideos } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/viral-research/service.ts")).href
);
const { describeWebResearchConfig } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/settings/web-research-config.ts")).href
);
const { loadUserSettings } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/settings/store.ts")).href
);

const query = { topic: "全屋智能" };
const settings = await loadUserSettings();
const config = await resolveViralResearchConfig();

console.log("=== Settings health ===");
console.log(describeWebResearchConfig(settings));

console.log("\n=== Runtime config ===");
console.log({
  enabled: config.dashscope.enabled,
  apiBaseUrl: config.dashscope.apiBaseUrl,
  model: config.dashscope.model,
  apiKeyConfigured: Boolean(config.dashscope.apiKey),
});

const fastConfig = {
  ...config.dashscope,
  model: process.env.WEB_RESEARCH_PROBE_MODEL?.trim() || config.dashscope.model,
};

console.log(`\n=== searchDashScope probe (${fastConfig.model}) ===`);
const startedAt = Date.now();
const raw = await searchDashScope(fastConfig, query);
console.log({
  elapsedMs: Date.now() - startedAt,
  status: raw.status,
  searchPerformed: raw.searchPerformed,
  itemCount: raw.items.length,
  degradedReason: raw.degradedReason ?? null,
  sampleTitles: raw.items.slice(0, 3).map((item) => item.title),
});

console.log("\n=== researchViralVideos (full service) ===");
const serviceStartedAt = Date.now();
const service = await researchViralVideos(
  "live-test-owner",
  { query, forceRefresh: true },
  { config },
);
const external = service.snapshot.items.filter((item) => item.sourceType === "dashscope");
console.log({
  elapsedMs: Date.now() - serviceStartedAt,
  provider: service.snapshot.provider,
  searchPerformed: service.snapshot.searchPerformed,
  externalCount: external.length,
  totalItems: service.snapshot.items.length,
  degradedReason: service.snapshot.degradedReason,
});

process.exit(raw.searchPerformed || external.length > 0 ? 0 : 1);
