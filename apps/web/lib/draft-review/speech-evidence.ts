import fs from "node:fs/promises";
import path from "node:path";
import {
  extractDashScopeError,
  isModelQuotaOrLimitError,
  resolveModelCandidates,
} from "@/lib/dashscope/model-fallback";
import { loadUserSettingsSync } from "@/lib/settings/store";
import {
  resolveApiKeyCandidates,
  resolveDashScopeBaseUrl,
  resolvePrimaryApiKey,
} from "@/lib/settings/credentials";

export interface DraftTranscriptEvidence {
  text: string;
  provider: string;
  model: string;
  language: string | null;
  /** 当前同步 ASR 不返回可信时间戳，不能伪造逐句秒点。 */
  segments: Array<{ startSecond: number; endSecond: number; text: string }>;
}

interface SpeechConfig {
  provider: string;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
}

interface SpeechResult {
  text: string;
  language: string | null;
  segments: DraftTranscriptEvidence["segments"];
}

function speechConfig(apiKey?: string, model?: string): SpeechConfig {
  const settings = loadUserSettingsSync();
  const speech = settings.providers.speech;
  return {
    provider: speech.provider.trim() || "dashscope",
    apiKey: apiKey?.trim() || resolvePrimaryApiKey("speech"),
    apiBaseUrl: (
      speech.apiBaseUrl.trim() ||
      process.env.SPEECH_API_BASE_URL?.trim() ||
      resolveDashScopeBaseUrl()
    ).replace(/\/$/u, ""),
    model:
      model?.trim() ||
      speech.model.trim() ||
      process.env.SPEECH_MODEL?.trim() ||
      "qwen-audio-3.0-asr-flash",
  };
}

function throwUnlessQuotaRetry(response: Response, body: unknown): void {
  const errorShape = extractDashScopeError(body);
  if (isModelQuotaOrLimitError(response.status, errorShape)) {
    throw new SpeechQuotaRetryError(
      errorShape?.message ?? `语音识别额度或限流（HTTP ${response.status}）`,
    );
  }
}

class SpeechQuotaRetryError extends Error {
  readonly name = "SpeechQuotaRetryError";
}

function isQwen3AsrFlash(model: string): boolean {
  return /^qwen3-asr-flash(?:-\d{4}-\d{2}-\d{2})?$/iu.test(model);
}

/** Qwen-Audio / Fun-ASR Flash：需 DashScope 原生 multimodal + format。 */
function isDashScopeNativeAudioAsr(model: string): boolean {
  return /^(?:qwen-audio-3\.0-asr-flash|fun-asr-flash)(?:-\w+)?$/iu.test(
    model.trim(),
  );
}

function resolveNativeDashScopeBaseUrl(apiBaseUrl: string): string {
  try {
    const url = new URL(apiBaseUrl);
    if (url.protocol !== "https:" || url.hostname !== "dashscope.aliyuncs.com") {
      return "https://dashscope.aliyuncs.com/api/v1";
    }
    return "https://dashscope.aliyuncs.com/api/v1";
  } catch {
    return "https://dashscope.aliyuncs.com/api/v1";
  }
}

function audioMimeAndFormat(filePath: string): {
  mime: string;
  format: string;
} {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3") return { mime: "audio/mpeg", format: "mp3" };
  if (extension === ".m4a") return { mime: "audio/mp4", format: "m4a" };
  if (extension === ".ogg") return { mime: "audio/ogg", format: "ogg" };
  return { mime: "audio/wav", format: "wav" };
}

function responseText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as {
    text?: unknown;
    output?: {
      text?: unknown;
      output?: { text?: unknown; sentence?: { text?: unknown } };
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (typeof record.text === "string" && record.text.trim()) {
    return record.text.trim();
  }
  const nested = record.output;
  if (nested && typeof nested === "object") {
    if (typeof nested.text === "string" && nested.text.trim()) {
      return nested.text.trim();
    }
    const inner = nested.output;
    if (inner && typeof inner === "object") {
      if (typeof inner.text === "string" && inner.text.trim()) {
        return inner.text.trim();
      }
      const sentence = inner.sentence?.text;
      if (typeof sentence === "string" && sentence.trim()) {
        return sentence.trim();
      }
    }
    const content = nested.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text ?? "")
            : "",
        )
        .join("\n")
        .trim();
    }
  }
  const content = record.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join("\n")
      .trim();
  }
  return "";
}

function providerError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as {
      error?: { message?: unknown };
      message?: unknown;
      code?: unknown;
    };
    const message = record.error?.message ?? record.message;
    if (typeof message === "string" && message.trim()) {
      const code = typeof record.code === "string" ? record.code.trim() : "";
      return code ? `${message.trim()}（${code}）` : message.trim();
    }
  }
  return `语音识别调用失败（HTTP ${status}）`;
}

async function transcribeWithQwen(
  audioPath: string,
  config: SpeechConfig,
): Promise<SpeechResult> {
  const audio = await fs.readFile(audioPath);
  const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: `data:audio/wav;base64,${audio.toString("base64")}`,
              },
            },
          ],
        },
      ],
      stream: false,
      asr_options: { enable_itn: true },
    }),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throwUnlessQuotaRetry(response, body);
    throw new Error(providerError(body, response.status));
  }
  const text = responseText(body);
  if (!text) throw new Error("语音识别返回内容为空");
  const annotation = (
    body as {
      choices?: Array<{
        message?: { annotations?: Array<{ language?: unknown }> };
      }>;
    }
  ).choices?.[0]?.message?.annotations?.[0];
  return {
    text,
    language:
      typeof annotation?.language === "string" ? annotation.language : null,
    segments: [],
  };
}

/**
 * Qwen-Audio-3.0-ASR-Flash / Fun-ASR-Flash：官方要求原生 multimodal-generation，
 * 且必须传 format / sample_rate；compatible chat 会报 format is empty。
 */
async function transcribeWithDashScopeNativeAudio(
  audioPath: string,
  config: SpeechConfig,
): Promise<SpeechResult> {
  const audio = await fs.readFile(audioPath);
  const { mime, format } = audioMimeAndFormat(audioPath);
  const endpoint = `${resolveNativeDashScopeBaseUrl(config.apiBaseUrl)}/services/aigc/multimodal-generation/generation`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: `data:${mime};base64,${audio.toString("base64")}`,
                },
              },
            ],
          },
        ],
      },
      parameters: {
        format,
        sample_rate: "16000",
      },
    }),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = providerError(body, response.status);
    if (/ASR_RESPONSE_HAVE_NO_WORDS/iu.test(message)) {
      return { text: "", language: null, segments: [] };
    }
    throwUnlessQuotaRetry(response, body);
    throw new Error(message);
  }
  const text = responseText(body);
  if (!text) {
    // 静音或无可辨识口播：保留空转写，交给上游写 limitation。
    return { text: "", language: null, segments: [] };
  }
  return { text, language: null, segments: [] };
}

export function parseTranscriptionSegments(
  body: unknown,
  durationSeconds?: number,
): DraftTranscriptEvidence["segments"] {
  const segments = (body as { segments?: unknown })?.segments;
  if (!Array.isArray(segments)) return [];
  return segments.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const start = Number(value.start);
    const rawEnd = Number(value.end);
    const text = String(value.text ?? "").trim();
    if (!Number.isFinite(start) || !Number.isFinite(rawEnd) || !text) return [];
    const clippedStart = Math.max(0, start);
    const clippedEnd = Math.min(
      Number.isFinite(durationSeconds) ? durationSeconds! : rawEnd,
      rawEnd,
    );
    if (clippedEnd <= clippedStart) return [];
    return [{ startSecond: clippedStart, endSecond: clippedEnd, text }];
  });
}

async function callCompatibleTranscription(
  audio: Buffer,
  config: SpeechConfig,
  responseFormat: "verbose_json" | "json",
): Promise<{ response: Response; body: unknown }> {
  const form = new FormData();
  form.set("model", config.model);
  form.set(
    "file",
    new Blob([Uint8Array.from(audio)], { type: "audio/wav" }),
    "evidence.wav",
  );
  form.set("response_format", responseFormat);
  const response = await fetch(`${config.apiBaseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  return {
    response,
    body: (await response.json().catch(() => null)) as unknown,
  };
}

async function transcribeWithCompatibleEndpoint(
  audioPath: string,
  config: SpeechConfig,
  durationSeconds?: number,
): Promise<SpeechResult> {
  const audio = await fs.readFile(audioPath);
  let { response, body } = await callCompatibleTranscription(
    audio,
    config,
    "verbose_json",
  );
  if (!response.ok && [400, 404, 415, 422].includes(response.status)) {
    ({ response, body } = await callCompatibleTranscription(audio, config, "json"));
  }
  if (!response.ok) {
    throwUnlessQuotaRetry(response, body);
    throw new Error(providerError(body, response.status));
  }
  const text = responseText(body);
  if (!text) throw new Error("语音识别返回内容为空");
  const language = (body as { language?: unknown })?.language;
  return {
    text,
    language: typeof language === "string" ? language : null,
    segments: parseTranscriptionSegments(body, durationSeconds),
  };
}

export function hasSpeechEvidenceCredentials(): boolean {
  return resolveApiKeyCandidates("speech").length > 0;
}

async function transcribeWithSpeechConfig(
  audioPath: string,
  config: SpeechConfig,
  durationSeconds?: number,
): Promise<SpeechResult> {
  if (isDashScopeNativeAudioAsr(config.model)) {
    return transcribeWithDashScopeNativeAudio(audioPath, config);
  }
  if (isQwen3AsrFlash(config.model)) {
    return transcribeWithQwen(audioPath, config);
  }
  return transcribeWithCompatibleEndpoint(audioPath, config, durationSeconds);
}

/**
 * 使用设置页的 Speech provider。
 * - qwen3-asr-flash：OpenAI 兼容 chat + input_audio
 * - qwen-audio-3.0-asr-flash / fun-asr-flash：DashScope 原生 multimodal + format
 * - 其他：常见 /audio/transcriptions 契约
 * 额度/限流时自动切换备选模型与设置页其他 Key 槽位。
 */
export async function transcribeDraftAudio(
  audioPath: string,
  durationSeconds?: number,
): Promise<DraftTranscriptEvidence> {
  const base = speechConfig();
  const apiKeys = resolveApiKeyCandidates("speech");
  const models = resolveModelCandidates("speech", base.model);
  if (apiKeys.length === 0) throw new Error("未配置 Speech API Key");

  let lastQuotaError: Error | undefined;
  let usedConfig = base;

  for (const apiKey of apiKeys) {
    for (const model of models) {
      usedConfig = speechConfig(apiKey, model);
      try {
        const result = await transcribeWithSpeechConfig(
          audioPath,
          usedConfig,
          durationSeconds,
        );
        if (!result.text.trim()) {
          throw new Error("语音识别返回内容为空（可能是静音或无可辨识口播）");
        }
        return {
          ...result,
          provider: usedConfig.provider,
          model: usedConfig.model,
        };
      } catch (error) {
        if (error instanceof SpeechQuotaRetryError) {
          lastQuotaError = error;
          continue;
        }
        throw error;
      }
    }
  }

  throw lastQuotaError ?? new Error("所有候选语音识别模型与 Key 均不可用");
}
