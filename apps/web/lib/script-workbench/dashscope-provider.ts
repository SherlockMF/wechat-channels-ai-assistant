import { scriptDraftOutputLooseSchema } from "@video-diagnosis/shared-types";
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
import { resolveShootStatus } from "@/lib/script-workbench/plain-text";
import {
  finalizeScriptOutput,
  markDegradedOutput,
} from "@/lib/script-workbench/production-guide";
import type { ScriptProvider } from "@/lib/script-workbench/provider";

import {
  hasResolvedDashScopeCredentials,
  resolveDashScopeBaseUrl,
  resolveDashScopeKey,
  resolveLlmModel,
} from "@/lib/settings/credentials";

export function hasDashScopeCredentials(): boolean {
  return hasResolvedDashScopeCredentials();
}

function dashscopeKey(): string {
  return resolveDashScopeKey();
}

function dashscopeBaseUrl(): string {
  return resolveDashScopeBaseUrl();
}

function llmModel(): string {
  return resolveLlmModel();
}

function schemaHint(koubo: boolean): string {
  const guide = `"productionGuide": {
    "shootStatus": "shot" | "unshot",
    "editGuidance": string[] (3-6 条可执行剪辑建议),
    "materials": [{"section": string, "description": string}] (仅 shot 填，否则 []),
    "storyboard": [{"order": number, "shot": string, "camera": string, "durationHint": string, "voiceCue": string}] (仅 unshot 填，否则 [])
  }`;
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
  ${guide},
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
  ${guide},
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
  private actualProviderName = "dashscope";

  get resultProviderName(): string {
    return this.actualProviderName;
  }

  async generate(request: ScriptGenerateRequest): Promise<ScriptDraftOutput> {
    this.actualProviderName = "dashscope";
    const koubo = isKouboFormat(request.format);
    const shootStatus = resolveShootStatus(request.input);
    const prompt = [
      "你是视频号脚本助手，服务开远本地智能家居/净水/水电公司「恒远」。",
      `制作形态：${formatLabel(request.format, request.input.formatOther)}`,
      `业务主题：${topicLabel(request.topic, request.input.topicOther)}`,
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
      `拍摄状态：${shootStatus === "shot" ? "已拍摄" : "未拍摄"}`,
      shootStatus === "shot"
        ? request.input.materialNotes?.trim()
          ? `用户手头素材（请贴合）：${request.input.materialNotes.trim()}`
          : "用户未提供手头素材：请按文案推断可用素材描述（materials），storyboard 必须为空数组。"
        : "未拍摄：请给出可执行拍摄分镜（storyboard），materials 必须为空数组。",
      "必须输出 productionGuide：两种状态都要有 editGuidance（节奏/转场/字幕卡点/BGM/删补）；shot 填 materials、unshot 填 storyboard。",
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
      const parsed = scriptDraftOutputLooseSchema.parse(extractJson(content));
      return finalizeScriptOutput(request, parsed as ScriptDraftOutput);
    } catch {
      this.actualProviderName = "mock-degraded";
      return markDegradedOutput(buildMockScriptOutput(request));
    }
  }
}
