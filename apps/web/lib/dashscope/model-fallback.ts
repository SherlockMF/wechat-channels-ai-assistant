import {
  resolveLlmModel,
  resolveSpeechModel,
  resolveVisionModel,
} from "@/lib/settings/credentials";

export type ModelRole = "llm" | "vision" | "speech" | "webResearch";

export class DashScopeQuotaError extends Error {
  readonly name = "DashScopeQuotaError";
}

const DEFAULT_FALLBACKS: Record<ModelRole, string[]> = {
  llm: ["qwen-plus-2025-07-28", "qwen-turbo", "qwen-max"],
  vision: ["qwen-vl-max", "qwen2.5-vl-72b-instruct", "qwen-plus"],
  speech: ["fun-asr-flash", "qwen3-asr-flash"],
  webResearch: ["qwen-plus-2025-07-28", "qwen-turbo", "qwen-max"],
};

const ENV_KEYS: Record<ModelRole, string> = {
  llm: "LLM_MODEL_FALLBACKS",
  vision: "VISION_MODEL_FALLBACKS",
  speech: "SPEECH_MODEL_FALLBACKS",
  webResearch: "WEB_RESEARCH_MODEL_FALLBACKS",
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function parseFallbackList(raw: string): string[] {
  return raw
    .split(/[,，;；]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    const normalized = model.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function fallbackModelsForRole(role: ModelRole): string[] {
  const fromEnv = parseFallbackList(env(ENV_KEYS[role]));
  return fromEnv.length > 0 ? fromEnv : DEFAULT_FALLBACKS[role];
}

export function resolvePrimaryModel(role: ModelRole, primary?: string): string {
  const explicit = primary?.trim();
  if (explicit) return explicit;
  if (role === "llm") return resolveLlmModel();
  if (role === "vision") return resolveVisionModel();
  if (role === "speech") return resolveSpeechModel();
  return "qwen-plus";
}

/** 主模型 + 环境变量/内置备选，去重后按优先级排列。 */
export function resolveModelCandidates(
  role: ModelRole,
  primary?: string,
): string[] {
  return dedupeModels([
    resolvePrimaryModel(role, primary),
    ...fallbackModelsForRole(role),
  ]);
}

export interface DashScopeErrorShape {
  code?: string;
  message?: string;
}

/** 额度用尽、限流等可换模型/Key 重试的错误；权限/参数错误不在此列。 */
export function isModelQuotaOrLimitError(
  status: number,
  error?: DashScopeErrorShape | null,
): boolean {
  if (status === 429 || status === 503) return true;
  const code = (error?.code ?? "").trim();
  const message = (error?.message ?? "").trim();
  if (!code && !message) return false;
  if (code === "Model.AccessDenied" || /Model access denied/iu.test(message)) {
    return false;
  }
  const combined = `${code} ${message}`.toLowerCase();
  return /quota|throttl|rate.?limit|insufficient|exhausted|free.?tier|额度|限流|用完|不足|超出/u.test(
    combined,
  );
}

export function extractDashScopeError(body: unknown): DashScopeErrorShape | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as {
    error?: { code?: string; message?: string };
    code?: string;
    message?: string;
  };
  const nested = record.error;
  const code =
    (typeof nested?.code === "string" ? nested.code : undefined) ??
    (typeof record.code === "string" ? record.code : undefined);
  const message =
    (typeof nested?.message === "string" ? nested.message : undefined) ??
    (typeof record.message === "string" ? record.message : undefined);
  if (!code && !message) return undefined;
  return { code, message };
}

/** 解析 JSON 或 SSE error 事件中的 DashScope 错误体。 */
export function parseDashScopeErrorRaw(raw: string): DashScopeErrorShape | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{")) {
    try {
      return extractDashScopeError(JSON.parse(trimmed) as unknown);
    } catch {
      return undefined;
    }
  }
  for (const line of trimmed.split(/\r?\n/u)) {
    const data = line.trim();
    if (!data.startsWith("data:")) continue;
    const payload = data.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = extractDashScopeError(JSON.parse(payload) as unknown);
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function friendlyDashScopeErrorMessage(
  error?: DashScopeErrorShape | null,
  status?: number,
): string | undefined {
  const code = (error?.code ?? "").trim();
  const message = (error?.message ?? "").trim();
  if (code === "AllocationQuota.FreeTierOnly") {
    return "百炼免费额度已用尽：请在控制台充值，或关闭「仅使用免费额度」后再试联网研究";
  }
  if (code === "Model.AccessDenied" || /Model access denied/iu.test(message)) {
    return message || "当前 Key 无权使用所选模型";
  }
  if (message) return message;
  if (status) return `HTTP ${status}`;
  return undefined;
}
