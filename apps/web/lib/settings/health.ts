import { execFile } from "node:child_process";
import { access, constants, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describeHotspotConfig, hotspotConfigIssues } from "@/lib/settings/hotspot-config";
import { loadUserSettings } from "@/lib/settings/store";
import type { HealthCheck } from "@/lib/settings/types";
import { describeWebResearchConfig, webResearchConfigIssues } from "@/lib/settings/web-research-config";

export type { HealthCheck } from "@/lib/settings/types";

const execFileAsync = promisify(execFile);

function isRealMode(): boolean {
  const mode = (
    process.env.APP_MODE ||
    process.env.NEXT_PUBLIC_APP_MODE ||
    "LOCAL"
  )
    .trim()
    .toUpperCase();
  return mode === "REAL";
}

function workerBaseUrl(): string {
  return (
    process.env.WORKER_URL?.trim() ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/u, "");
}

function storageRoot(): string {
  return path.resolve(
    process.env.PRIVATE_STORAGE_ROOT?.trim() ||
      path.join(process.cwd(), ".data", "uploads"),
  );
}

async function checkCommand(bin: string): Promise<HealthCheck> {
  const id = bin;
  const label = bin === "ffmpeg" ? "FFmpeg" : "FFprobe";
  try {
    const { stdout } = await execFileAsync(bin, ["-version"], {
      timeout: 8000,
      windowsHide: true,
    });
    const first = stdout.split(/\r?\n/u)[0]?.trim() || "available";
    return { id, label, ok: true, message: first };
  } catch {
    return {
      id,
      label,
      ok: false,
      message:
        "未在当前运行环境中找到。请确认 FFmpeg 与 ffprobe 已安装并加入 PATH。",
    };
  }
}

async function checkWorker(): Promise<HealthCheck> {
  if (!isRealMode()) {
    return {
      id: "worker",
      label: "Worker",
      ok: true,
      message:
        "当前为本地 LOCAL 模式，不要求独立 Worker。",
    };
  }

  const url = `${workerBaseUrl()}/health`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return {
        id: "worker",
        label: "Worker",
        ok: false,
        message: `探活失败 HTTP ${response.status}。请检查 Worker 服务状态。`,
      };
    }
    return {
      id: "worker",
      label: "Worker",
      ok: true,
      message: `可达 (${url})`,
    };
  } catch {
    return {
      id: "worker",
      label: "Worker",
      ok: false,
      message: "无法连接 Worker，请检查服务状态与 WORKER_URL 配置。",
    };
  }
}

async function checkPostgres(): Promise<HealthCheck> {
  if (!isRealMode()) {
    return {
      id: "postgres",
      label: "Postgres",
      ok: true,
      message:
        "当前为本地 LOCAL 模式，数据走本地仓库，不强制 Postgres。",
    };
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return {
      id: "postgres",
      label: "Postgres",
      ok: false,
      message: "REAL 模式必须配置 DATABASE_URL。",
    };
  }
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 4000,
    });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return {
      id: "postgres",
      label: "Postgres",
      ok: true,
      message: "连接成功",
    };
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "无法连接，请确认数据库已启动。";
    return {
      id: "postgres",
      label: "Postgres",
      ok: false,
      message: `连接失败：${detail}`,
    };
  }
}

async function checkStorage(): Promise<HealthCheck> {
  const root = storageRoot();
  try {
    await mkdir(root, { recursive: true });
    await access(root, constants.W_OK);
    const probe = path.join(root, `.health-${Date.now()}.tmp`);
    await writeFile(probe, "ok", "utf8");
    const { unlink } = await import("node:fs/promises");
    await unlink(probe);
    return {
      id: "storage",
      label: "私有存储",
      ok: true,
      message: root,
    };
  } catch {
    return {
      id: "storage",
      label: "私有存储",
      ok: false,
      message: `目录不可写：${root}`,
    };
  }
}

async function checkApiConfigured(): Promise<HealthCheck> {
  const settings = await loadUserSettings();
  const key =
    settings.providers.dashscopeApiKey.trim() ||
    settings.providers.vision.apiKey.trim() ||
    settings.providers.llm.apiKey.trim() ||
    settings.providers.speech.apiKey.trim() ||
    settings.providers.webResearch.apiKey.trim() ||
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.VISION_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    process.env.SPEECH_API_KEY?.trim() ||
    "";
  if (key) {
    return {
      id: "api",
      label: "API 配置",
      ok: true,
      message: "已配置密钥（设置页或环境变量）",
    };
  }
  return {
    id: "api",
    label: "API 配置",
    ok: false,
    message: "尚未配置 API Key。请到设置 → API 配置填写。",
  };
}

async function checkWebResearch(): Promise<HealthCheck> {
  const settings = await loadUserSettings();
  if (!settings.providers.webResearch.enabled) {
    return {
      id: "webResearch",
      label: "联网爆款研究",
      ok: true,
      message: "未启用联网爆款研究",
    };
  }
  const issues = webResearchConfigIssues(settings);
  return {
    id: "webResearch",
    label: "联网爆款研究",
    ok: issues.length === 0,
    message:
      issues.length > 0
        ? issues.join("；")
        : describeWebResearchConfig(settings),
  };
}

/** 只做配置体检：RSS 源探测慢且容易触发限流，不在体检里发网络请求。 */
async function checkHotspots(): Promise<HealthCheck> {
  const settings = await loadUserSettings();
  if (!settings.providers.hotspots.enabled) {
    return {
      id: "hotspots",
      label: "热点研究",
      ok: true,
      message: "未启用热点研究",
    };
  }
  const issues = hotspotConfigIssues(settings);
  return {
    id: "hotspots",
    label: "热点研究",
    ok: issues.length === 0,
    message:
      issues.length > 0 ? issues.join("；") : describeHotspotConfig(settings),
  };
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const [postgres, worker, ffmpeg, ffprobe, storage, api, webResearch, hotspots] =
    await Promise.all([
    checkPostgres(),
    checkWorker(),
    checkCommand("ffmpeg"),
    checkCommand("ffprobe"),
    checkStorage(),
    checkApiConfigured(),
    checkWebResearch(),
    checkHotspots(),
  ]);
  return [
    {
      id: "web",
      label: "Web",
      ok: true,
      message: isRealMode()
        ? "服务进程正常（REAL）"
        : "服务进程正常（本地 LOCAL 开发）",
    },
    postgres,
    worker,
    ffmpeg,
    ffprobe,
    storage,
    api,
    webResearch,
    hotspots,
  ];
}
