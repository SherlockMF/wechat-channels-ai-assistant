import { loadUserSettingsSync } from "@/lib/settings/store";

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export function resolveDashScopeKey(): string {
  const settings = loadUserSettingsSync();
  return (
    settings.providers.dashscopeApiKey.trim() ||
    settings.providers.vision.apiKey.trim() ||
    settings.providers.llm.apiKey.trim() ||
    env("DASHSCOPE_API_KEY") ||
    env("VISION_API_KEY") ||
    env("LLM_API_KEY")
  );
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
    "qwen3.7-plus"
  );
}

export function resolveVisionModel(): string {
  const settings = loadUserSettingsSync();
  return (
    settings.providers.vision.model.trim() ||
    settings.providers.llm.model.trim() ||
    env("VISION_MODEL") ||
    env("LLM_MODEL") ||
    "qwen3.7-plus"
  );
}

export function hasResolvedDashScopeCredentials(): boolean {
  return Boolean(resolveDashScopeKey());
}
