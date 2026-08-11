import { diagnosisResultSchema } from "@video-diagnosis/shared-types";
import type {
  DiagnosisResult,
  DraftReviewScriptSnapshot,
  ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import type { AccountBaseline } from "@/lib/metrics/account";
import type { DraftEvidenceManifest } from "@/lib/draft-review/evidence";
import type { SimilarVideoSummary } from "@/lib/draft-review/similar-videos";
import { buildDraftDiagnosis } from "@/lib/draft-review/diagnosis";
import {
  DashScopeDraftReviewProvider,
  hasDashScopeCredentials,
} from "@/lib/draft-review/dashscope-provider";
import { ensureRepoEnvLoaded } from "@/lib/env/load-repo-env";

export interface DraftReviewProviderInput {
  evidence: DraftEvidenceManifest;
  baseline: AccountBaseline | null;
  similarVideos?: SimilarVideoSummary[];
  /** 创建视频版本时冻结的脚本，不能用随后编辑的脚本替换。 */
  scriptSnapshot?: DraftReviewScriptSnapshot | null;
  /** 可追溯的联网研究结果；缺失时 Provider 必须明确降级，不能假装实时搜索。 */
  researchSnapshot?: ViralResearchSnapshot | null;
}

export interface DraftReviewProvider {
  readonly name: string;
  readonly resultProviderName?: string;
  analyze(input: DraftReviewProviderInput): Promise<DiagnosisResult>;
}

export class MockDraftReviewProvider implements DraftReviewProvider {
  readonly name = "mock";
  readonly resultProviderName = "mock";

  async analyze(input: DraftReviewProviderInput): Promise<DiagnosisResult> {
    return buildDraftDiagnosis(
      input.evidence,
      input.baseline,
      input.similarVideos ?? [],
      input.scriptSnapshot ?? null,
      input.researchSnapshot ?? null,
    );
  }
}

export class HttpDraftReviewProvider implements DraftReviewProvider {
  readonly name = "http";

  constructor(private readonly endpoint: string) {}

  async analyze(input: DraftReviewProviderInput): Promise<DiagnosisResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`LLM Provider 返回 ${response.status}`);
    }
    const payload = await response.json();
    return diagnosisResultSchema.parse(payload);
  }
}

export function resolveDraftReviewProvider(): DraftReviewProvider {
  ensureRepoEnvLoaded();
  const endpoint = process.env.LLM_DRAFT_REVIEW_URL?.trim();
  if (endpoint) {
    return new HttpDraftReviewProvider(endpoint);
  }
  const provider = (process.env.VISION_PROVIDER || process.env.LLM_PROVIDER || "")
    .trim()
    .toLocaleLowerCase();
  if (provider === "dashscope" || hasDashScopeCredentials()) {
    return new DashScopeDraftReviewProvider();
  }
  return new MockDraftReviewProvider();
}
