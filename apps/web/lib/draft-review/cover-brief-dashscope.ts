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

import { callDashScopeChatCompletions } from "@/lib/dashscope/chat-completions";
import {
  hasResolvedDashScopeCredentials,
  resolveDashScopeBaseUrl,
  resolveVisionModel,
} from "@/lib/settings/credentials";

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
    if (!hasResolvedDashScopeCredentials()) {
      throw new Error("未配置 DASHSCOPE_API_KEY / VISION_API_KEY");
    }

    const dataUrl = await imageToDataUrl(
      input.backgroundPath,
      input.backgroundMimeType || "image/jpeg",
    );
    const result = await callDashScopeChatCompletions({
      role: "vision",
      baseUrl: dashscopeBaseUrl(),
      primaryModel: visionModel(),
      buildBody: (model) => ({
        model,
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
    const rawText = result.content;
    if (!rawText.trim()) throw new Error("百炼返回内容为空");
    return parseCoverBriefOutput(extractJsonObject(rawText));
  }
}

export function hasCoverBriefDashScopeCredentials(): boolean {
  return hasResolvedDashScopeCredentials();
}

export function resolveCoverBriefProvider(): CoverBriefProvider {
  if (hasCoverBriefDashScopeCredentials()) {
    return new DashScopeCoverBriefProvider();
  }
  return new MockCoverBriefProvider();
}
