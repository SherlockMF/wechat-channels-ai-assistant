import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const appRoot = fileURLToPath(new URL(".", import.meta.url));
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function cloudRuntimeAliases(): Plugin {
  const aliases = new Map([
    [
      "@/lib/data/repository",
      resolve(appRoot, "lib/data/cloud-repository.ts"),
    ],
    [
      "@/lib/data/migration",
      resolve(appRoot, "lib/data/cloud-migration.ts"),
    ],
    [
      "@/lib/storage/private-storage",
      resolve(appRoot, "lib/storage/cloud-storage.ts"),
    ],
  ]);
  return {
    name: "cloud-runtime-aliases",
    enforce: "pre",
    resolveId(source) {
      return aliases.get(source) ?? null;
    },
  };
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      cloudRuntimeAliases(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
