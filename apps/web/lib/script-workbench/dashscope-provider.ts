import { scriptDraftOutputSchema } from "@video-diagnosis/shared-types";
import type { ScriptDraftOutput } from "@video-diagnosis/shared-types";
import {
  formatLabel,
  isKouboFormat,
  smartSubTopicLabels,
  topicLabel,
} from "@/lib/script-workbench/catalog";
import {
  buildMockScriptOutput,
  type ScriptGenerateRequest,
} from "@/lib/script-workbench/mock-generate";
import { outputToPlainText } from "@/lib/script-workbench/plain-text";
import type { ScriptProvider } from "@/lib/script-workbench/provider";

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export function hasDashScopeCredentials(): boolean {
  return Boolean(
    env("DASHSCOPE_API_KEY") || env("VISION_API_KEY") || env("LLM_API_KEY"),
  );
}

function dashscopeKey(): string {
  return env("DASHSCOPE_API_KEY") || env("VISION_API_KEY") || env("LLM_API_KEY");
}

function dashscopeBaseUrl(): string {
  return (
    env("LLM_API_BASE_URL") ||
    env("VISION_API_BASE_URL") ||
    env("DASHSCOPE_API_BASE_URL") ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/u, "");
}

function llmModel(): string {
  return env("LLM_MODEL") || env("VISION_MODEL") || "qwen3.7-plus";
}

function schemaHint(koubo: boolean): string {
  if (koubo) {
    return `只输出一个 JSON 对象，不要 Markdown。字段：
{
  "pipeline": "koubo",
  "titles": string[] (2-3),
  "tags": string[],
  "script": string (可直接念的完整口播),
  "brollCues": [{"section": string, "cue": string}],
  "subtitleBeats": string[],
  "altHooks": string[] (1-2),
  "positioning": null,
  "timeline": [],
  "gapsOrWarnings": string[],
  "plainText": string
}`;
  }
  return `只输出一个 JSON 对象，不要 Markdown。字段：
{
  "pipeline": "follow",
  "titles": string[],
  "tags": string[],
  "script": "",
  "brollCues": [],
  "subtitleBeats": [],
  "altHooks": [],
  "positioning": string,
  "timeline": [{"order": number, "shoot": string, "say": string, "subtitle": string}],
  "gapsOrWarnings": string[],
  "plainText": string
}`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回 JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

export class DashScopeScriptProvider implements ScriptProvider {
  readonly name = "dashscope";

  async generate(request: ScriptGenerateRequest): Promise<ScriptDraftOutput> {
    const koubo = isKouboFormat(request.format);
    const prompt = [
      "你是视频号脚本助手，服务开远本地智能家居/净水/水电公司「恒远」。",
      `制作形态：${formatLabel(request.format)}`,
      `业务主题：${topicLabel(request.topic)}`,
      request.subTopics.length
        ? `智能子品：${smartSubTopicLabels(request.subTopics).join("、")}`
        : "",
      request.processKinds.length
        ? `服务过程类型：${request.processKinds.join("、")}`
        : "",
      `一句话选题/画面思路（短）：${request.input.idea}`,
      request.input.existingScript?.trim()
        ? `用户已写好的当前脚本（优先保留其口播与分镜结构，不要大段重写；主要补标题、标签、穿插素材、字幕要点、备选开头）：\n${request.input.existingScript.trim()}`
        : "用户未提供当前脚本：请根据选题新写口播稿。",
      request.input.sellingPoints
        ? `强调卖点：${request.input.sellingPoints}`
        : "",
      request.input.targetSeconds
        ? `目标时长约 ${request.input.targetSeconds} 秒`
        : "",
      request.referenceHints?.length
        ? `历史参考（勿照抄）：\n${request.referenceHints.join("\n")}`
        : "",
      "标题必须是完整短句，禁止把长文截断成「……手...」这类残缺标题；标签与文案用中文产品名（如窗帘），不要输出英文枚举值如 curtain。",
      koubo
        ? "产出可直接念的短口播 + 穿插素材提示 + 字幕要点。口语自然，少堆参数。若已有当前脚本，script 字段尽量沿用用户原文（可轻微润色标点）。"
        : "产出拍摄/剪辑大纲时间线，不是长口播。服务过程强调信任与真实，注意隐私提醒。",
      request.format === "vlog"
        ? "Vlog 轻量：不硬套产品结构；若无主题不要硬广。"
        : "",
      schemaHint(koubo),
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await fetch(`${dashscopeBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dashscopeKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: llmModel(),
          temperature: 0.7,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok) {
        throw new Error(`DashScope ${response.status}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = scriptDraftOutputSchema.parse(extractJson(content));
      return {
        ...parsed,
        plainText: parsed.plainText?.trim() || outputToPlainText(parsed),
      };
    } catch {
      return buildMockScriptOutput(request);
    }
  }
}
