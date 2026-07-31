import { z } from "zod";
import { ensureRepoEnvLoaded } from "@/lib/env/load-repo-env";
import { extractJsonObject } from "@/lib/draft-review/dashscope-provider";
import { normalizeDraftTags } from "@/lib/draft-review/similar-videos";

const tagsResponseSchema = z.object({
  tags: z.array(z.string()).min(1).max(8),
});

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function dashscopeKey(): string {
  ensureRepoEnvLoaded();
  return (
    env("DASHSCOPE_API_KEY") ||
    env("VISION_API_KEY") ||
    env("LLM_API_KEY")
  );
}

function dashscopeBaseUrl(): string {
  return (
    env("VISION_API_BASE_URL") ||
    env("LLM_API_BASE_URL") ||
    env("DASHSCOPE_API_BASE_URL") ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/u, "");
}

function llmModel(): string {
  return env("LLM_MODEL") || env("VISION_MODEL") || "qwen3.7-plus";
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
  const key = dashscopeKey();
  if (!key) throw new Error("未配置大模型密钥");

  const prompt = [
    "你是视频号内容标签助手。根据视频标题归纳 3～5 个短标签。",
    "要求：",
    "1. 标签用于检索历史相似视频，偏主题/行业/场景/产品，不要完整复述标题。",
    "2. 每个标签 2～8 个字，中文为主，不要序号、不要解释。",
    '3. 只输出 JSON：{"tags":["标签1","标签2","标签3"]}',
    `视频标题：${title}`,
  ].join("\n");

  const response = await fetch(`${dashscopeBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: llmModel(),
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  if (!response.ok) {
    throw new Error(body.error?.message ?? `标签归纳失败（HTTP ${response.status}）`);
  }
  const message = body.choices?.[0]?.message?.content;
  const text =
    typeof message === "string"
      ? message
      : Array.isArray(message)
        ? message.map((part) => part.text ?? "").join("\n")
        : "";
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

  if (dashscopeKey()) {
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
