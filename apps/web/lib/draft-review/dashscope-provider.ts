import path from "node:path";
import { diagnosisResultSchema } from "@video-diagnosis/shared-types";
import type { DiagnosisResult } from "@video-diagnosis/shared-types";
import type { AccountBaseline } from "@/lib/metrics/account";
import type { DraftEvidenceManifest } from "@/lib/draft-review/evidence";
import type {
  DraftReviewProvider,
  DraftReviewProviderInput,
} from "@/lib/draft-review/provider";
import { buildDraftDiagnosis } from "@/lib/draft-review/diagnosis";
import {
  formatSimilarVideosForPrompt,
  type SimilarVideoSummary,
} from "@/lib/draft-review/similar-videos";
import { readPrivateFileAsDataUrl } from "@/lib/storage/storage";

import {
  hasResolvedDashScopeCredentials,
  resolveDashScopeBaseUrl,
  resolveDashScopeKey,
  resolveVisionModel,
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

function visionModel(): string {
  return resolveVisionModel();
}

function mimeForImage(filePath: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function imageToDataUrl(filePath: string): Promise<string | null> {
  if (!filePath) return null;
  return readPrivateFileAsDataUrl(filePath, mimeForImage(filePath));
}

function baselineFacts(baseline: AccountBaseline | null): string[] {
  if (!baseline) return ["暂无账号基线，仅根据画面与标题/目标做发布前审片。"];
  const completion = baseline.recent10.completionRate;
  const watch = baseline.recent10.averageWatchSeconds;
  return [
    `账号近 10 条中位完播率：${
      completion === null || completion === undefined
        ? "暂无"
        : `${(completion * 100).toFixed(1)}%`
    }`,
    `账号近 10 条中位平均观看：${
      watch === null || watch === undefined ? "暂无" : `${watch.toFixed(1)} 秒`
    }`,
  ];
}

function schemaHint(): string {
  return `只输出一个 JSON 对象，不要 Markdown，不要解释。字段必须符合：
{
  "executiveSummary": string,
  "dataAssessment": {
    "performanceLevel": "low"|"normal"|"high",
    "sampleConfidence": "low"|"medium"|"high",
    "facts": string[]
  },
  "primaryProblems": [{
    "category": "hook"|"copy"|"visual"|"subtitle"|"pacing"|"audio"|"structure",
    "severity": "high"|"medium"|"low",
    "startSecond": number,
    "endSecond": number,
    "contentEvidence": string[],
    "dataEvidence": string[],
    "inference": string,
    "recommendation": string,
    "expectedMetric": "completion_rate"|"average_watch_seconds"|"like_rate"|"comment_rate"|"share_rate"|"follow_rate",
    "confidence": "low"|"medium"|"high"
  }] (最多 3 条),
  "editingPlan": [{
    "startSecond": number,
    "endSecond": number,
    "originalContent": string,
    "problem": string,
    "action": "delete"|"trim"|"replace"|"move_forward"|"speed_up"|"add_subtitle"|"change_audio"|"reshoot"|"keep",
    "replacementContent": string,
    "requiresReshoot": boolean
  }],
  "revisedOpening": [{
    "startSecond": number,
    "endSecond": number,
    "visual": string,
    "voiceover": string,
    "subtitle": string,
    "audio": string,
    "editingRhythm": string,
    "requiresReshoot": boolean
  }],
  "hookAlternatives": [{
    "type": "result"|"pain_point"|"suspense",
    "voiceover": string,
    "subtitle": string,
    "visual": string
  }] (2~3 条),
  "copySuggestions": {
    "originalSummary": string,
    "revisedFullScript": string,
    "subtitleVersion": string,
    "cta": string
  },
  "copyAndSubtitleReview": {
    "copyRationality": string,
    "copyProfessionalism": string,
    "subtitleRationality": string,
    "subtitleProfessionalism": string,
    "issues": string[],
    "revisionPoints": string[]
  },
  "titleSuggestions": [{
    "title": string,
    "rationale": string,
    "expectedEffect": string,
    "basedOnSimilarTitles": string[]
  }] (2~5 条),
  "audioSuggestions": {
    "currentIssues": string[],
    "musicMood": string,
    "bpmRange": string,
    "openingAudioAction": string,
    "voiceMusicBalance": string,
    "transitionSuggestions": string[],
    "avoid": string[]
  },
  "limitations": string[]
}
约束：endSecond > startSecond；时间段必须落在 0～视频时长内；不得声称有真实逐秒留存数据；建议要具体可执行；文案/字幕必须评估合理性与专业性；标题建议必须参考给出的历史相似视频（若有）。`;
}

function buildUserPrompt(
  evidence: DraftEvidenceManifest,
  baseline: AccountBaseline | null,
  similarVideos: SimilarVideoSummary[] = [],
): string {
  return [
    "你是视频号发布前审片顾问。根据分镜板、镜头切换、账号基线与历史相似视频，给出可执行的剪辑修改建议。",
    "必须重点评估：口播文案与字幕的合理性（逻辑/承诺是否可验证、是否与标题一致）与专业性（术语是否恰当、是否夸大、信息密度是否合适）。",
    "必须根据视频标签与历史相似视频的标题/完播/观看数据，给出 2～5 条可直接使用的标题建议，并写明依据了哪些相似标题。",
    `视频时长：${evidence.durationSeconds.toFixed(1)} 秒`,
    `标题：${evidence.title ?? "未填写"}`,
    `发布目标：${evidence.goal ?? "未填写"}`,
    `视频标签：${(evidence.tags ?? []).join("、") || "未填写"}`,
    `镜头切换秒点（部分）：${evidence.sceneCutSeconds.slice(0, 30).join(", ") || "无"}`,
    `静音/低信息段数：${evidence.silenceRanges.length}`,
    "账号基线：",
    ...baselineFacts(baseline).map((fact) => `- ${fact}`),
    "历史相似视频（按标签/标题相似度）：",
    formatSimilarVideosForPrompt(similarVideos),
    schemaHint(),
  ].join("\n");
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("模型未返回 JSON 对象");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callDashscopeChat(input: {
  model: string;
  text: string;
  imageDataUrls: string[];
}): Promise<string> {
  const key = dashscopeKey();
  if (!key) throw new Error("未配置 DASHSCOPE_API_KEY / VISION_API_KEY");

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: input.text },
  ];
  for (const url of input.imageDataUrls) {
    content.push({
      type: "image_url",
      image_url: { url },
    });
  }

  const response = await fetch(`${dashscopeBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      messages: [{ role: "user", content }],
    }),
  });

  const body = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  if (!response.ok) {
    const rawMessage = body.error?.message ?? `百炼调用失败（HTTP ${response.status}）`;
    const code = (body.error as { code?: string } | undefined)?.code;
    if (code === "Model.AccessDenied" || /Model access denied/iu.test(rawMessage)) {
      throw new Error(
        `模型无调用权限（${input.model}）。请在百炼模型广场对该模型开通「API 调用」，或改用已开通的 qwen3.7-plus。`,
      );
    }
    throw new Error(rawMessage);
  }
  const message = body.choices?.[0]?.message?.content;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message.map((part) => part.text ?? "").join("\n");
  }
  throw new Error("百炼返回内容为空");
}

export class DashScopeDraftReviewProvider implements DraftReviewProvider {
  readonly name = "dashscope";
  private actualProviderName = "dashscope";

  get resultProviderName(): string {
    return this.actualProviderName;
  }

  async analyze(input: DraftReviewProviderInput): Promise<DiagnosisResult> {
    this.actualProviderName = "dashscope";
    const imagePaths = [
      input.evidence.combinedBoard,
      input.evidence.openingBoard,
      input.evidence.fullBoard,
    ].filter(Boolean);
    const imageDataUrls: string[] = [];
    for (const imagePath of imagePaths) {
      const dataUrl = await imageToDataUrl(imagePath);
      if (dataUrl) imageDataUrls.push(dataUrl);
      if (imageDataUrls.length >= 2) break;
    }

    const prompt = buildUserPrompt(
      input.evidence,
      input.baseline,
      input.similarVideos ?? [],
    );
    const raw = await callDashscopeChat({
      model: visionModel(),
      text: prompt,
      imageDataUrls,
    });

    try {
      return diagnosisResultSchema.parse(extractJsonObject(raw));
    } catch (firstError) {
      const repairPrompt = [
        "上一次输出无法通过 Schema 校验。请只输出修正后的完整 JSON。",
        `校验错误：${firstError instanceof Error ? firstError.message : String(firstError)}`,
        schemaHint(),
        "原始输出：",
        raw.slice(0, 12_000),
      ].join("\n");
      const repaired = await callDashscopeChat({
        model: visionModel(),
        text: repairPrompt,
        imageDataUrls: [],
      });
      try {
        return diagnosisResultSchema.parse(extractJsonObject(repaired));
      } catch {
        this.actualProviderName = "mock";
        const fallback = buildDraftDiagnosis(
          input.evidence,
          input.baseline,
          input.similarVideos ?? [],
        );
        fallback.limitations = [
          ...fallback.limitations,
          "百炼返回未通过 Schema，已回退到结构化启发诊断；请检查模型输出或稍后重试。",
        ];
        return fallback;
      }
    }
  }
}

