import { scriptDraftOutputSchema } from "@video-diagnosis/shared-types";
import type { ScriptDraftOutput } from "@video-diagnosis/shared-types";
import { ensureRepoEnvLoaded } from "@/lib/env/load-repo-env";
import {
  buildMockScriptOutput,
  type ScriptGenerateRequest,
} from "@/lib/script-workbench/mock-generate";
import { outputToPlainText } from "@/lib/script-workbench/plain-text";
import { DashScopeScriptProvider, hasDashScopeCredentials } from "@/lib/script-workbench/dashscope-provider";

export interface ScriptProvider {
  readonly name: string;
  generate(request: ScriptGenerateRequest): Promise<ScriptDraftOutput>;
}

export class MockScriptProvider implements ScriptProvider {
  readonly name = "mock";

  async generate(request: ScriptGenerateRequest): Promise<ScriptDraftOutput> {
    return buildMockScriptOutput(request);
  }
}

export function finalizeOutput(raw: unknown): ScriptDraftOutput {
  const parsed = scriptDraftOutputSchema.parse(raw);
  if (!parsed.plainText?.trim()) {
    return { ...parsed, plainText: outputToPlainText(parsed) };
  }
  return parsed;
}

export function resolveScriptProvider(): ScriptProvider {
  ensureRepoEnvLoaded();
  const provider = (process.env.LLM_PROVIDER || process.env.VISION_PROVIDER || "")
    .trim()
    .toLocaleLowerCase();
  if (provider === "dashscope" || hasDashScopeCredentials()) {
    return new DashScopeScriptProvider();
  }
  return new MockScriptProvider();
}
