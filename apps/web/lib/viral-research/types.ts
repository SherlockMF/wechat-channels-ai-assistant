import { z } from "zod";
import type {
  ImportedVideoRecord,
  ViralResearchItem,
  ViralResearchSnapshot,
  ViralResearchTopicCard,
} from "@video-diagnosis/shared-types";

export const VIRAL_RESEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

export interface ResearchAnalysisDraft {
  commonPatterns: string[];
  topicCards: Array<
    Omit<ViralResearchTopicCard, "id" | "sourceIds"> & {
      sourceIndexes: number[];
    }
  >;
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
}

export interface ViralResearchServiceResult {
  snapshot: ViralResearchSnapshot;
  cacheHit: boolean;
  expired: boolean;
}

export type {
  ViralResearchItem,
  ViralResearchSnapshot,
  ViralResearchTopicCard,
};
