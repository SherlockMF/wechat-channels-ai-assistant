import {
  extractDashScopeError,
  isModelQuotaOrLimitError,
  resolveModelCandidates,
  type ModelRole,
} from "@/lib/dashscope/model-fallback";
import {
  resolveApiKeyCandidates,
  type CredentialRole,
} from "@/lib/settings/credentials";

export interface DashScopeChatCompletionResult {
  content: string;
  model: string;
  apiKey: string;
  usedFallback: boolean;
  usedKeyFallback: boolean;
}

type ChatCompletionBody = Record<string, unknown>;

function credentialRoleForModelRole(role: ModelRole): CredentialRole {
  return role;
}

function extractMessageContent(body: {
  choices?: Array<{
    message?: { content?: string | Array<{ text?: string }> };
  }>;
}): string {
  const message = body.choices?.[0]?.message?.content;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message.map((part) => part.text ?? "").join("\n");
  }
  return "";
}

function formatChatCompletionError(
  status: number,
  model: string,
  error?: { code?: string; message?: string },
): Error {
  const rawMessage = error?.message ?? `百炼调用失败（HTTP ${status}）`;
  const code = error?.code;
  if (code === "Model.AccessDenied" || /Model access denied/iu.test(rawMessage)) {
    return new Error(
      `模型无调用权限（${model}）。请在百炼模型广场对该模型开通「API 调用」，或改用其他已开通模型。`,
    );
  }
  return new Error(rawMessage);
}

export async function callDashScopeChatCompletions(input: {
  role: ModelRole;
  baseUrl: string;
  primaryModel?: string;
  /** 指定单 Key 时仅使用该 Key（测试/特殊场景）；默认从设置页各槽位自动收集备选 Key。 */
  apiKey?: string;
  buildBody: (model: string) => ChatCompletionBody;
  signal?: AbortSignal;
}): Promise<DashScopeChatCompletionResult> {
  const models = resolveModelCandidates(input.role, input.primaryModel);
  const primaryModel = models[0] ?? "";
  const apiKeys = input.apiKey?.trim()
    ? [input.apiKey.trim()]
    : resolveApiKeyCandidates(credentialRoleForModelRole(input.role));
  if (apiKeys.length === 0) {
    throw new Error("未配置 DashScope API Key");
  }

  const primaryKey = apiKeys[0] ?? "";
  let lastQuotaError: Error | undefined;

  for (const apiKey of apiKeys) {
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex]!;
      const response = await fetch(
        `${input.baseUrl.replace(/\/$/u, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.buildBody(model)),
          signal: input.signal,
        },
      );

      const body = (await response.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
        choices?: Array<{
          message?: { content?: string | Array<{ text?: string }> };
        }>;
      };

      if (!response.ok) {
        const errorShape = extractDashScopeError(body);
        const hasMoreModels = modelIndex < models.length - 1;
        const hasMoreKeys = apiKey !== apiKeys[apiKeys.length - 1];
        if (
          isModelQuotaOrLimitError(response.status, errorShape) &&
          (hasMoreModels || hasMoreKeys)
        ) {
          lastQuotaError = new Error(
            errorShape?.message ?? `百炼额度或限流（HTTP ${response.status}）`,
          );
          continue;
        }
        throw formatChatCompletionError(response.status, model, errorShape);
      }

      const content = extractMessageContent(body);
      if (!content.trim()) {
        throw new Error("百炼返回内容为空");
      }

      return {
        content,
        model,
        apiKey,
        usedFallback: model !== primaryModel,
        usedKeyFallback: apiKey !== primaryKey,
      };
    }
  }

  throw lastQuotaError ?? new Error("所有候选模型与 Key 均不可用");
}
