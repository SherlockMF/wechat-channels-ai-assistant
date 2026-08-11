import { z } from "zod";
import { ensureRepoEnvLoaded } from "@/lib/env/load-repo-env";
import { extractJsonObject } from "@/lib/draft-review/dashscope-provider";
import { normalizeDraftTags } from "@/lib/draft-review/similar-videos";

const tagsResponseSchema = z.object({
  tags: z.array(z.string()).min(1).max(8),
});

import { callDashScopeChatCompletions } from "@/lib/dashscope/chat-completions";
import {
  hasResolvedDashScopeCredentials,
  resolveDashScopeBaseUrl,
  resolveLlmModel,
} from "@/lib/settings/credentials";

function dashscopeBaseUrl(): string {
  return resolveDashScopeBaseUrl();
}

function llmModel(): string {
  return resolveLlmModel();
}

/** 无大模型时的轻量启发式：从标题切出可用短标签。 */
export function heuristicTagsFromTitle(title: string): string[] {
  const cleaned = title
    .replace(/\.[a-z0-9]{2,5}$/iu, "")
    .replace(/[_\-【】\[\]()（）]+/gu, " ")
    .trim();
  if (!cleaned) return [];

  const parts = cleaned
    .split(/[\s,，、|/；;:+：]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 12);

  const unique = [...new Set(parts)];
  if (unique.length >= 2) return unique.slice(0, 5);

  // 单段标题：按常见长度切出 2～4 字短语（粗粒度）
  const compact = cleaned.replace(/\s+/gu, "");
  const chunks: string[] = [];
  if (compact.length <= 6) {
    chunks.push(compact);
  } else {
    for (let size = 4; size >= 2; size -= 1) {
      for (let i = 0; i + size <= compact.length && chunks.length < 4; i += size) {
        chunks.push(compact.slice(i, i + size));
      }
      if (chunks.length >= 2) break;
    }
  }
  return normalizeDraftTags(chunks).slice(0, 5);
}

async function callLlmForTags(title: string): Promise<string[]> {
  const prompt = [
    "你是视频号内容标签助手。根据视频标题归纳 3～5 个短标签。",
    "要求：",
    "1. 标签用于检索历史相似视频，偏主题/行业/场景/产品，不要完整复述标题。",
    "2. 每个标签 2～8 个字，中文为主，不要序号、不要解释。",
    '3. 只输出 JSON：{"tags":["标签1","标签2","标签3"]}',
    `视频标题：${title}`,
  ].join("\n");

  const result = await callDashScopeChatCompletions({
    role: "llm",
    baseUrl: dashscopeBaseUrl(),
    primaryModel: llmModel(),
    buildBody: (model) => ({
      model,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const text = result.content;
  if (!text.trim()) throw new Error("模型未返回标签");

  const parsed = tagsResponseSchema.parse(extractJsonObject(text));
  return normalizeDraftTags(parsed.tags).slice(0, 5);
}

export async function suggestTagsFromTitle(title: string): Promise<{
  tags: string[];
  source: "llm" | "heuristic";
}> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return { tags: [], source: "heuristic" };
  }

  if (hasResolvedDashScopeCredentials()) {
    ensureRepoEnvLoaded();
    try {
      const tags = await callLlmForTags(normalizedTitle);
      if (tags.length > 0) return { tags, source: "llm" };
    } catch {
      // fall through to heuristic
    }
  }

  return {
    tags: heuristicTagsFromTitle(normalizedTitle),
    source: "heuristic",
  };
}
