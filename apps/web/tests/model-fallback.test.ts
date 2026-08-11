import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callDashScopeChatCompletions } from "@/lib/dashscope/chat-completions";
import {
  fallbackModelsForRole,
  isModelQuotaOrLimitError,
  resolveModelCandidates,
} from "@/lib/dashscope/model-fallback";
import { resolveApiKeyCandidates } from "@/lib/settings/credentials";

describe("model fallback", () => {
  const previousPath = process.env.USER_SETTINGS_PATH;

  afterEach(async () => {
    delete process.env.LLM_MODEL_FALLBACKS;
    delete process.env.DASHSCOPE_API_KEY_FALLBACKS;
    if (previousPath === undefined) delete process.env.USER_SETTINGS_PATH;
    else process.env.USER_SETTINGS_PATH = previousPath;
    vi.restoreAllMocks();
  });

  it("detects quota and rate-limit style errors", () => {
    expect(isModelQuotaOrLimitError(429, { message: "Rate limit exceeded" })).toBe(
      true,
    );
    expect(
      isModelQuotaOrLimitError(403, {
        code: "Throttling.RateQuota",
        message: "free tier quota exhausted",
      }),
    ).toBe(true);
    expect(
      isModelQuotaOrLimitError(403, {
        code: "Model.AccessDenied",
        message: "Model access denied",
      }),
    ).toBe(false);
  });

  it("builds candidate list with built-in fallbacks", () => {
    expect(resolveModelCandidates("llm", "qwen-plus")).toEqual([
      "qwen-plus",
      "qwen-plus-2025-07-28",
      "qwen-turbo",
      "qwen-max",
    ]);
    expect(fallbackModelsForRole("vision")).toContain("qwen-vl-max");
    expect(fallbackModelsForRole("speech")).toEqual([
      "fun-asr-flash",
      "qwen3-asr-flash",
    ]);
  });

  it("respects LLM_MODEL_FALLBACKS env override", () => {
    process.env.LLM_MODEL_FALLBACKS = "qwen-max,qwen-turbo";
    expect(resolveModelCandidates("llm", "qwen-plus")).toEqual([
      "qwen-plus",
      "qwen-max",
      "qwen-turbo",
    ]);
  });

  it("collects api keys from settings page slots by role", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "key-fallback-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");
    await writeFile(
      process.env.USER_SETTINGS_PATH,
      JSON.stringify({
        providers: {
          dashscopeApiKey: "sk-main",
          llm: { apiKey: "sk-llm" },
          vision: { apiKey: "sk-vision" },
          speech: { apiKey: "sk-speech" },
          webResearch: { apiKey: "sk-research" },
        },
      }),
      "utf8",
    );

    expect(resolveApiKeyCandidates("llm")).toEqual([
      "sk-llm",
      "sk-main",
      "sk-vision",
      "sk-speech",
      "sk-research",
    ]);
    expect(resolveApiKeyCandidates("webResearch")[0]).toBe("sk-research");

    await rm(tempDir, { recursive: true, force: true });
  });

  it("retries chat completions on quota errors with next model", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "quota exceeded for qwen3.7-plus" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callDashScopeChatCompletions({
      role: "llm",
      apiKey: "sk-test",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      primaryModel: "qwen3.7-plus",
      buildBody: (model) => ({ model, messages: [] }),
    });

    expect(result.model).toBe("qwen-plus-2025-07-28");
    expect(result.usedFallback).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries with next api key after models exhaust quota on first key", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "key-fallback-"));
    process.env.USER_SETTINGS_PATH = path.join(tempDir, "user-settings.json");
    process.env.LLM_MODEL_FALLBACKS = "qwen-max";
    await writeFile(
      process.env.USER_SETTINGS_PATH,
      JSON.stringify({
        providers: {
          dashscopeApiKey: "sk-secondary",
          llm: { apiKey: "sk-primary" },
        },
      }),
      "utf8",
    );

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = String(
        (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
      );
      if (auth.includes("sk-primary")) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: "quota" } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "ok" } }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callDashScopeChatCompletions({
      role: "llm",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      primaryModel: "qwen3.7-plus",
      buildBody: (model) => ({ model, messages: [] }),
    });

    expect(result.apiKey).toBe("sk-secondary");
    expect(result.usedKeyFallback).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);

    await rm(tempDir, { recursive: true, force: true });
  });
});
