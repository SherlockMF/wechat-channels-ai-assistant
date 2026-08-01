import type {
  AnalysisJobStatus,
  DiagnosisResult,
  DraftCoverBrief,
  DraftReview,
  DraftReviewResult,
  DraftReviewVersion,
  ImportedVideoRecord,
  ScriptDraft,
  VideoAsset,
  VideoMatch,
} from "@video-diagnosis/shared-types";

export interface ImportEntry {
  id: string;
  ownerId: string;
  originalFilename: string;
  sheetName: string;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  status: "previewed" | "imported" | "rolled_back";
  createdAt: string;
}

export interface AnalysisJob {
  id: string;
  ownerId: string;
  videoRecordId: string;
  videoAssetId: string;
  status: AnalysisJobStatus;
  progress: number;
  currentStep: string;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AnalysisResultEntry {
  id: string;
  analysisJobId: string;
  result: DiagnosisResult;
  editedMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  imports: ImportEntry[];
  records: ImportedVideoRecord[];
  assets: VideoAsset[];
  matches: VideoMatch[];
  jobs: AnalysisJob[];
  results: AnalysisResultEntry[];
  draftReviews: DraftReview[];
  draftReviewVersions: DraftReviewVersion[];
  draftResults: DraftReviewResult[];
  draftCoverBriefs: DraftCoverBrief[];
  scriptDrafts: ScriptDraft[];
}

export const emptyState = (): AppState => ({
  imports: [],
  records: [],
  assets: [],
  matches: [],
  jobs: [],
  results: [],
  draftReviews: [],
  draftReviewVersions: [],
  draftResults: [],
  draftCoverBriefs: [],
  scriptDrafts: [],
});
