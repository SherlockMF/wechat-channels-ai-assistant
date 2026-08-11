import { loadUserSettingsSync } from "@/lib/settings/store";

export type CredentialRole = "llm" | "vision" | "speech" | "webResearch";

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function parseKeyList(raw: string): string[] {
  return raw
    .split(/[,，;；\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || trimmed.includes("*")) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** 设置页各 Key 槽位 + 环境变量 + DASHSCOPE_API_KEY_FALLBACKS，按角色优先级去重。 */
export function resolveApiKeyCandidates(role: CredentialRole): string[] {
  const settings = loadUserSettingsSync();
  const providers = settings.providers;
  const roleKeys: Record<CredentialRole, string[]> = {
    llm: [
      providers.llm.apiKey,
      providers.dashscopeApiKey,
      providers.vision.apiKey,
      providers.speech.apiKey,
      providers.webResearch.apiKey,
    ],
    vision: [
      providers.vision.apiKey,
      providers.dashscopeApiKey,
      providers.llm.apiKey,
      providers.speech.apiKey,
      providers.webResearch.apiKey,
    ],
    speech: [
      providers.speech.apiKey,
      providers.dashscopeApiKey,
      providers.llm.apiKey,
      providers.vision.apiKey,
      providers.webResearch.apiKey,
    ],
    webResearch: [
      providers.webResearch.apiKey,
      providers.dashscopeApiKey,
      providers.llm.apiKey,
      providers.vision.apiKey,
      providers.speech.apiKey,
    ],
  };

  const envKeys = [
    env("DASHSCOPE_API_KEY"),
    role === "llm" ? env("LLM_API_KEY") : "",
    role === "vision" ? env("VISION_API_KEY") : "",
    role === "speech" ? env("SPEECH_API_KEY") : "",
    ...parseKeyList(env("DASHSCOPE_API_KEY_FALLBACKS")),
  ];

  return dedupeKeys([...roleKeys[role], ...envKeys]);
}

export function resolvePrimaryApiKey(role: CredentialRole): string {
  return resolveApiKeyCandidates(role)[0] ?? "";
}

export function resolveDashScopeKey(): string {
  for (const role of [
    "llm",
    "vision",
    "speech",
    "webResearch",
  ] as CredentialRole[]) {
    const key = resolvePrimaryApiKey(role);
    if (key) return key;
  }
  return "";
}

export function resolveDashScopeBaseUrl(): string {
  const settings = loadUserSettingsSync();
  return (
    settings.providers.dashscopeApiBaseUrl.trim() ||
    settings.providers.llm.apiBaseUrl.trim() ||
    settings.providers.vision.apiBaseUrl.trim() ||
    env("LLM_API_BASE_URL") ||
    env("VISION_API_BASE_URL") ||
    env("DASHSCOPE_API_BASE_URL") ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/u, "");
}

export function resolveLlmModel(): string {
  const settings = loadUserSettingsSync();
  return (
    settings.providers.llm.model.trim() ||
    settings.providers.vision.model.trim() ||
    env("LLM_MODEL") ||
    env("VISION_MODEL") ||
    "qwen-plus"
  );
}

export function resolveVisionModel(): string {
  const settings = loadUserSettingsSync();
  return (
    settings.providers.vision.model.trim() ||
    settings.providers.llm.model.trim() ||
    env("VISION_MODEL") ||
    env("LLM_MODEL") ||
    "qwen-vl-plus"
  );
}

export function resolveSpeechModel(): string {
  const settings = loadUserSettingsSync();
  return (
    settings.providers.speech.model.trim() ||
    env("SPEECH_MODEL") ||
    "qwen-audio-3.0-asr-flash"
  );
}

export function hasResolvedDashScopeCredentials(): boolean {
  return resolveApiKeyCandidates("llm").length > 0;
}
