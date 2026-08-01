import path from "node:path";
import * as nextEnvNamespace from "@next/env";
import type { NextConfig } from "next";

const nextEnv = nextEnvNamespace as typeof nextEnvNamespace & {
  default?: typeof nextEnvNamespace;
};
const loadEnvConfig =
  nextEnv.loadEnvConfig ?? nextEnv.default?.loadEnvConfig;
if (!loadEnvConfig) {
  throw new Error("@next/env 未提供 loadEnvConfig");
}

// 优先加载仓库根目录 .env（monorepo），再加载 apps/web/.env
const appDir = process.cwd();
const repoRoot = path.resolve(appDir, "../..");
loadEnvConfig(repoRoot);
loadEnvConfig(appDir);

const localAliases = {
  "@/lib/data/repository": "./lib/data/local-runtime-repository.ts",
  "@/lib/data/migration": "./lib/data/local-migration.ts",
  "@/lib/storage/storage": "./lib/storage/private-storage.ts",
};

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@video-diagnosis/database",
    "@video-diagnosis/shared-types",
    "@video-diagnosis/prompt-templates",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  turbopack: {
    resolveAlias: localAliases,
  },
  webpack(config) {
    for (const [request, replacement] of Object.entries(localAliases)) {
      config.resolve.alias[request] = path.resolve(process.cwd(), replacement);
    }
    return config;
  },
};

export default nextConfig;
