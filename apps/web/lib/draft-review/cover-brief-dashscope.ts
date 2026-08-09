import { extractJsonObject } from "@/lib/draft-review/dashscope-provider";
import {
  MockCoverBriefProvider,
  buildCoverBriefSystemPrompt,
  type CoverBriefGenerateInput,
  type CoverBriefOutput,
  type CoverBriefProvider,
  parseCoverBriefOutput,
} from "@/lib/draft-review/cover-brief-provider";
import { readPrivateFileAsDataUrl } from "@/lib/storage/storage";

import {
  resolveDashScopeBaseUrl,
  resolveDashScopeKey,
  resolveVisionModel,
} from "@/lib/settings/credentials";

function dashscopeKey(): string {
  return resolveDashScopeKey();
}

function dashscopeBaseUrl(): string {
  return resolveDashScopeBaseUrl();
}

function visionModel(): string {
  return resolveVisionModel();
}

async function imageToDataUrl(
  filePath: string,
  mimeType: string,
): Promise<string> {
  const dataUrl = await readPrivateFileAsDataUrl(filePath, mimeType);
  if (!dataUrl) {
    throw new Error("背景图不存在或不可读");
  }
  return dataUrl;
}

export class DashScopeCoverBriefProvider implements CoverBriefProvider {
  readonly name = "dashscope";

  async generate(input: CoverBriefGenerateInput): Promise<CoverBriefOutput> {
    const key = dashscopeKey();
    if (!key) throw new Error("未配置 DASHSCOPE_API_KEY / VISION_API_KEY");

    const dataUrl = await imageToDataUrl(
      input.backgroundPath,
      input.backgroundMimeType || "image/jpeg",
    );
    const response = await fetch(`${dashscopeBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel(),
        temperature: 0.35,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildCoverBriefSystemPrompt(input) },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    const body = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{
        message?: { content?: string | Array<{ text?: string }> };
      }>;
    };
    if (!response.ok) {
      throw new Error(
        body.error?.message ?? `百炼调用失败（HTTP ${response.status}）`,
      );
    }
    const message = body.choices?.[0]?.message?.content;
    const rawText =
      typeof message === "string"
        ? message
        : Array.isArray(message)
          ? message.map((part) => part.text ?? "").join("\n")
          : "";
    if (!rawText.trim()) throw new Error("百炼返回内容为空");
    return parseCoverBriefOutput(extractJsonObject(rawText));
  }
}

export function hasCoverBriefDashScopeCredentials(): boolean {
  return Boolean(dashscopeKey());
}

export function resolveCoverBriefProvider(): CoverBriefProvider {
  if (hasCoverBriefDashScopeCredentials()) {
    return new DashScopeCoverBriefProvider();
  }
  return new MockCoverBriefProvider();
}
