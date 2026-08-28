import { z } from "zod";
import type {
  ImportedVideoRecord,
  ViralResearchItem,
  ViralResearchSnapshot,
  ViralResearchTopicCard,
} from "@video-diagnosis/shared-types";

export const VIRAL_RESEARCH_CACHE_TTL_MS = 72 * 60 * 60 * 1000;

/** owner 目录只保留最近若干个不可变快照，其余按时间清理。 */
export const VIRAL_RESEARCH_SNAPSHOT_RETENTION = 30;

const optionalQueryField = z.string().trim().min(1).max(120).optional();

export const viralResearchQuerySchema = z.object({
  topic: z.string().trim().min(2).max(200),
  format: optionalQueryField,
  audience: optionalQueryField,
  contentGoal: optionalQueryField,
  region: optionalQueryField,
});

export const viralResearchRequestSchema = z.object({
  query: viralResearchQuerySchema,
  forceRefresh: z.boolean().optional().default(false),
});

export type ViralResearchQuery = z.infer<typeof viralResearchQuerySchema>;
export type ViralResearchRequest = z.input<typeof viralResearchRequestSchema>;

export type ResearchAdapterStatus =
  | "ok"
  | "disabled"
  | "misconfigured"
  | "permission_denied"
  | "failed";

export interface DashScopeResearchConfig {
  enabled: boolean;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  freshnessDays: number;
}

export interface ViralResearchRuntimeConfig {
  dashscope: DashScopeResearchConfig;
}

/** 模型对每条联网来源的打标结果，用于替代依赖空摘要的相关性判定。 */
export interface ResearchSourceJudgement {
  index: number;
  relevant: boolean;
  kind: "platform_page" | "media_article" | "generic_page";
  reason: string;
}

export interface ResearchAnalysisDraft {
  commonPatterns: string[];
  topicCards: Array<
    Omit<ViralResearchTopicCard, "id" | "sourceIds" | "evidenceStrength"> & {
      sourceIndexes: number[];
    }
  >;
  sourceJudgements: ResearchSourceJudgement[];
}

export interface AdapterResearchItem extends ViralResearchItem {
  sourceIndex?: number;
}

export interface ResearchAdapterResult {
  status: ResearchAdapterStatus;
  searchPerformed: boolean;
  items: AdapterResearchItem[];
  degradedReason?: string;
  analysis?: ResearchAnalysisDraft;
}

export interface ViralResearchServiceOptions {
  config?: ViralResearchRuntimeConfig;
  fetchImpl?: typeof fetch;
  storageRoot?: string;
  now?: () => Date;
  ownedHistory?: ImportedVideoRecord[];
  loadOwnedHistory?: () => Promise<ImportedVideoRecord[]>;
  viralSamples?: import("@video-diagnosis/shared-types").ViralSample[];
  loadViralSamples?: () => Promise<
    import("@video-diagnosis/shared-types").ViralSample[]
  >;
}

export interface ViralResearchServiceResult {
  snapshot: ViralResearchSnapshot;
  cacheHit: boolean;
  expired: boolean;
  /** 快照已过期但仍可用（实时检索没拿到新来源时的兜底）。 */
  stale?: boolean;
}

export type {
  ViralResearchItem,
  ViralResearchSnapshot,
  ViralResearchTopicCard,
};
