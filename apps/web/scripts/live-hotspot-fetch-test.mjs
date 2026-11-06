import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const server = await createServer({
  root,
  configFile: false,
  resolve: { alias: {
    "@": root,
    "@video-diagnosis/shared-types": path.resolve(root, "../../packages/shared-types/src/index.ts"),
  } },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { fetchHotspotSources } = await server.ssrLoadModule("/lib/hotspots/feed.ts");
  const { resolveHotspotRuntimeConfig, resolveHotspotSources } = await server.ssrLoadModule("/lib/hotspots/sources.ts");
  // 只验收默认抓取器，不调用模型、不写入用户快照、不输出设置或凭证。
  const config = resolveHotspotRuntimeConfig();
  const startedAt = Date.now();
  const results = await fetchHotspotSources(resolveHotspotSources(config), { maxItemsPerSource: config.maxItemsPerSource });
  console.log(JSON.stringify({ elapsedMs: Date.now() - startedAt, total: results.reduce((sum, result) => sum + result.entries.length, 0), sources: results.map((result) => result.report) }, null, 2));
  process.exitCode = results.every((result) => result.report.status === "ok" && result.report.itemCount > 0) ? 0 : 1;
} finally {
  await server.close();
}
