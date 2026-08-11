import type { UserSettings } from "@/lib/settings/schema";

export const NATIVE_DASHSCOPE_RESEARCH_BASE_URL =
  "https://dashscope.aliyuncs.com/api/v1";

export function isCompatibleModeDashScopeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      url.hostname === "dashscope.aliyuncs.com" &&
      url.pathname.includes("/compatible-mode/")
    );
  } catch {
    return false;
  }
}

export function isNativeDashScopeResearchUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      url.hostname === "dashscope.aliyuncs.com" &&
      !url.pathname.includes("/compatible-mode/")
    );
  } catch {
    return false;
  }
}

export function normalizeWebResearchBlock(
  webResearch: UserSettings["providers"]["webResearch"],
): UserSettings["providers"]["webResearch"] {
  const apiBaseUrl = webResearch.apiBaseUrl.trim();
  return {
    ...webResearch,
    apiBaseUrl:
      !apiBaseUrl || isCompatibleModeDashScopeUrl(apiBaseUrl)
        ? NATIVE_DASHSCOPE_RESEARCH_BASE_URL
        : apiBaseUrl.replace(/\/$/u, ""),
    model: webResearch.model.trim() || "qwen-plus",
    freshnessDays: webResearch.freshnessDays ?? 30,
  };
}

export function normalizeUserSettingsProviders(
  providers: UserSettings["providers"],
): UserSettings["providers"] {
  return {
    ...providers,
    webResearch: normalizeWebResearchBlock(providers.webResearch),
  };
}

function webResearchKeyCandidates(settings: UserSettings): string[] {
  const providers = settings.providers;
  const keys = [
    providers.webResearch.apiKey,
    providers.dashscopeApiKey,
    providers.llm.apiKey,
    providers.vision.apiKey,
    providers.speech.apiKey,
    process.env.DASHSCOPE_API_KEY?.trim() ?? "",
  ]
    .map((item) => item.trim())
    .filter((item) => item && !item.includes("*"));
  return [...new Set(keys)];
}

export function webResearchConfigIssues(settings: UserSettings): string[] {
  const webResearch = settings.providers.webResearch;
  if (!webResearch.enabled) {
    return ["联网爆款研究未启用"];
  }

  const issues: string[] = [];
  if (webResearchKeyCandidates(settings).length === 0) {
    issues.push("未配置 Research Key，且无可复用的百炼 Key 或环境变量");
  }
  const apiBaseUrl = webResearch.apiBaseUrl.trim();
  if (apiBaseUrl && isCompatibleModeDashScopeUrl(apiBaseUrl)) {
    issues.push(
      "Research Base URL 误填为 compatible-mode，应使用原生 API（/api/v1）",
    );
  } else if (apiBaseUrl && !isNativeDashScopeResearchUrl(apiBaseUrl)) {
    issues.push(
      "Research Base URL 必须是 https://dashscope.aliyuncs.com 原生地址",
    );
  }
  return issues;
}

export function describeWebResearchConfig(settings: UserSettings): string {
  const webResearch = settings.providers.webResearch;
  if (!webResearch.enabled) {
    return "未启用联网爆款研究";
  }
  const issues = webResearchConfigIssues(settings);
  if (issues.length > 0) {
    return issues.join("；");
  }
  const keySource = webResearch.apiKey.trim()
    ? "独立 Research Key"
    : "复用百炼 Key";
  return `已就绪（${keySource}；模型 ${webResearch.model.trim() || "qwen-plus"}；Native API）`;
}
