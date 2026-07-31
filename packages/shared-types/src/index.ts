import { z } from "zod";

export const sampleConfidenceSchema = z.enum(["low", "medium", "high"]);
export const analysisJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const timelineSegmentSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  startSecond: z.number().nonnegative(),
  endSecond: z.number().positive(),
  transcript: z.string().optional(),
  subtitleText: z.string().optional(),
  visualDescription: z.string(),
  audioDescription: z.string().optional(),
  shotType: z.enum([
    "person",
    "product",
    "result",
    "construction",
    "environment",
    "transition",
    "text_card",
    "unknown",
  ]),
  informationFunction: z.enum([
    "hook",
    "context",
    "pain_point",
    "solution",
    "evidence",
    "result",
    "cta",
    "filler",
    "unknown",
  ]),
  isStatic: z.boolean(),
  isRepeated: z.boolean(),
  isSilent: z.boolean(),
  hasSpeech: z.boolean(),
  hasSubtitle: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const diagnosisResultSchema = z.object({
  executiveSummary: z.string().min(1),
  dataAssessment: z.object({
    performanceLevel: z.enum(["low", "normal", "high"]),
    sampleConfidence: sampleConfidenceSchema,
    facts: z.array(z.string()).min(1),
  }),
  primaryProblems: z
    .array(
      z
        .object({
          category: z.enum([
            "hook",
            "copy",
            "visual",
            "subtitle",
            "pacing",
            "audio",
            "structure",
          ]),
          severity: z.enum(["high", "medium", "low"]),
          startSecond: z.number().nonnegative(),
          endSecond: z.number().positive(),
          contentEvidence: z.array(z.string()),
          dataEvidence: z.array(z.string()),
          inference: z.string(),
          recommendation: z.string(),
          expectedMetric: z.enum([
            "completion_rate",
            "average_watch_seconds",
            "like_rate",
            "comment_rate",
            "share_rate",
            "follow_rate",
          ]),
          confidence: sampleConfidenceSchema,
        })
        .refine((value) => value.endSecond > value.startSecond, {
          message: "问题结束时间必须晚于开始时间",
        }),
    )
    .max(3),
  editingPlan: z.array(
    z
      .object({
        startSecond: z.number().nonnegative(),
        endSecond: z.number().positive(),
        originalContent: z.string(),
        problem: z.string(),
        action: z.enum([
          "delete",
          "trim",
          "replace",
          "move_forward",
          "speed_up",
          "add_subtitle",
          "change_audio",
          "reshoot",
          "keep",
        ]),
        replacementContent: z.string(),
        sourceAsset: z
          .object({
            sourceStartSecond: z.number().nonnegative(),
            sourceEndSecond: z.number().positive(),
          })
          .optional(),
        requiresReshoot: z.boolean(),
      })
      .refine((value) => value.endSecond > value.startSecond, {
        message: "剪辑动作结束时间必须晚于开始时间",
      }),
  ),
  revisedOpening: z.array(
    z
      .object({
        startSecond: z.number().nonnegative(),
        endSecond: z.number().positive(),
        visual: z.string(),
        voiceover: z.string(),
        subtitle: z.string(),
        audio: z.string(),
        editingRhythm: z.string(),
        sourceAssetStartSecond: z.number().nonnegative().optional(),
        sourceAssetEndSecond: z.number().positive().optional(),
        requiresReshoot: z.boolean(),
      })
      .refine((value) => value.endSecond > value.startSecond, {
        message: "新版开头结束时间必须晚于开始时间",
      }),
  ),
  hookAlternatives: z
    .array(
      z.object({
        type: z.enum(["result", "pain_point", "suspense"]),
        voiceover: z.string(),
        subtitle: z.string(),
        visual: z.string(),
      }),
    )
    .min(2)
    .max(3),
  copySuggestions: z.object({
    originalSummary: z.string(),
    revisedFullScript: z.string(),
    subtitleVersion: z.string(),
    cta: z.string(),
  }),
  copyAndSubtitleReview: z.object({
    copyRationality: z.string(),
    copyProfessionalism: z.string(),
    subtitleRationality: z.string(),
    subtitleProfessionalism: z.string(),
    issues: z.array(z.string()).min(1),
    revisionPoints: z.array(z.string()).min(1),
  }),
  titleSuggestions: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
        expectedEffect: z.string(),
        basedOnSimilarTitles: z.array(z.string()).default([]),
      }),
    )
    .min(2)
    .max(5),
  audioSuggestions: z.object({
    currentIssues: z.array(z.string()),
    musicMood: z.string(),
    bpmRange: z.string().optional(),
    openingAudioAction: z.string(),
    voiceMusicBalance: z.string(),
    transitionSuggestions: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  limitations: z.array(z.string()).min(1),
});

export type TimelineSegment = z.infer<typeof timelineSegmentSchema>;
export type DiagnosisResult = z.infer<typeof diagnosisResultSchema>;
export type AnalysisJobStatus = z.infer<typeof analysisJobStatusSchema>;
export type SampleConfidence = z.infer<typeof sampleConfidenceSchema>;

export interface ImportedVideoRecord {
  id: string;
  importId: string;
  spreadsheetRow: number;
  platformVideoId: string | null;
  normalizedPlatformVideoId: string | null;
  description: string;
  normalizedDescription: string;
  publishedAt: string;
  completionRate: number | null;
  averageWatchSeconds: number | null;
  views: number | null;
  recommendations: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  follows: number | null;
  shareToChat: number | null;
  setAsRingtone: number | null;
  setAsStatus: number | null;
  setAsMomentsCover: number | null;
  wecomLinkClicks: number | null;
  wecomLinkUsers: number | null;
  contactAddCount: number | null;
  contactAddUsers: number | null;
}

export type CoverSource = "uploaded" | "frame";

export interface VideoAsset {
  id: string;
  importId: string;
  originalFilename: string;
  normalizedFilename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  lastModifiedAt: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  processingStatus: string;
  coverPath: string | null;
  coverSource: CoverSource | null;
  coverFrameSecond: number | null;
}

export interface VideoMatch {
  id: string;
  videoAssetId: string;
  videoRecordId: string | null;
  method: "platform_id" | "exact_title" | "containment" | "fuzzy" | "manual";
  similarityScore: number;
  status: "matched" | "needs_review" | "unmatched";
  confirmedByUser: boolean;
  candidates: Array<{
    videoRecordId: string;
    description: string;
    score: number;
  }>;
}

export const draftReviewStatusSchema = z.enum([
  "uploaded",
  "processing",
  "completed",
  "failed",
]);

export type DraftReviewStatus = z.infer<typeof draftReviewStatusSchema>;

export const DRAFT_REVIEW_MAX_VERSIONS = 5;

export interface DraftReviewChangelogItem {
  category: DiagnosisResult["primaryProblems"][number]["category"];
  summary: string;
  startSecond?: number;
  endSecond?: number;
}

export interface DraftReviewChangelog {
  improved: DraftReviewChangelogItem[];
  remaining: DraftReviewChangelogItem[];
  newIssues: DraftReviewChangelogItem[];
}

/** 审片会话下的单个视频版本 */
export interface DraftReviewVersion {
  id: string;
  draftReviewId: string;
  versionNumber: number;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  coverPath: string | null;
  coverSource: CoverSource | null;
  coverFrameSecond: number | null;
  evidencePath: string | null;
  status: DraftReviewStatus;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DraftReview {
  id: string;
  ownerId: string;
  title: string | null;
  goal: string | null;
  /** 用于检索历史相似视频并生成标题建议，如「软水」「装修避坑」 */
  tags: string[];
  /** 当前活跃版本；旧数据可能缺失，读取时会迁移 */
  currentVersionId: string | null;
  /** 版本数量缓存，便于列表展示 */
  versionCount: number;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  coverPath: string | null;
  coverSource: CoverSource | null;
  coverFrameSecond: number | null;
  evidencePath: string | null;
  baselineImportId: string | null;
  status: DraftReviewStatus;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DraftReviewResult {
  id: string;
  draftReviewId: string;
  /** 所属版本；旧数据可能缺失，读取时挂到 v1 */
  draftReviewVersionId: string;
  result: DiagnosisResult;
  editedMarkdown: string | null;
  provider: string;
  changelog: DraftReviewChangelog | null;
  createdAt: string;
  updatedAt: string;
}

export const scriptDraftFormatSchema = z.enum([
  "koubo",
  "showroom_koubo",
  "service_intro",
  "project_finish",
  "hydro_site",
  "service_process",
  "vlog",
]);

export const scriptDraftTopicSchema = z.enum([
  "smart_home",
  "water",
  "hydro",
  "service",
]);

export const scriptDraftSmartSubTopicSchema = z.enum([
  "lighting",
  "curtain",
  "theater",
  "voice",
  "panel",
  "security",
  "scene",
]);

export const scriptDraftProcessKindSchema = z.enum([
  "plan_meeting",
  "install_inspect",
  "progress_check",
]);

export const scriptDraftStatusSchema = z.enum(["draft", "ready"]);
export const scriptDraftPipelineSchema = z.enum(["koubo", "follow"]);

export const scriptDraftInputSchema = z.object({
  idea: z.string().min(1),
  /** 已写好的口播/分镜稿；有则优先润色与配素材，少重写 */
  existingScript: z.string().optional(),
  sellingPoints: z.string().optional(),
  targetSeconds: z.number().int().positive().optional(),
  tone: z.enum(["casual", "dry"]).optional(),
  projectType: z.string().optional(),
  shotNotes: z.string().optional(),
  highlight: z.string().optional(),
  siteNotes: z.string().optional(),
  standardPoints: z.string().optional(),
  processKinds: z.array(scriptDraftProcessKindSchema).optional(),
  clientScene: z.string().optional(),
  mustShoot: z.string().optional(),
  dayPlan: z.string().optional(),
  internalNote: z.string().optional(),
});

export const scriptDraftOutputSchema = z.object({
  pipeline: scriptDraftPipelineSchema,
  titles: z.array(z.string()),
  tags: z.array(z.string()),
  script: z.string(),
  brollCues: z.array(
    z.object({
      section: z.string(),
      cue: z.string(),
    }),
  ),
  subtitleBeats: z.array(z.string()),
  altHooks: z.array(z.string()),
  positioning: z.string().nullable(),
  timeline: z.array(
    z.object({
      order: z.number().int(),
      shoot: z.string(),
      say: z.string(),
      subtitle: z.string(),
    }),
  ),
  gapsOrWarnings: z.array(z.string()),
  plainText: z.string(),
});

export type ScriptDraftFormat = z.infer<typeof scriptDraftFormatSchema>;
export type ScriptDraftTopic = z.infer<typeof scriptDraftTopicSchema>;
export type ScriptDraftSmartSubTopic = z.infer<
  typeof scriptDraftSmartSubTopicSchema
>;
export type ScriptDraftProcessKind = z.infer<
  typeof scriptDraftProcessKindSchema
>;
export type ScriptDraftStatus = z.infer<typeof scriptDraftStatusSchema>;
export type ScriptDraftPipeline = z.infer<typeof scriptDraftPipelineSchema>;
export type ScriptDraftInput = z.infer<typeof scriptDraftInputSchema>;
export type ScriptDraftOutput = z.infer<typeof scriptDraftOutputSchema>;

export interface ScriptDraft {
  id: string;
  ownerId: string;
  format: ScriptDraftFormat;
  topic: ScriptDraftTopic | null;
  subTopics: ScriptDraftSmartSubTopic[];
  processKinds: ScriptDraftProcessKind[];
  title: string | null;
  ideaSummary: string;
  input: ScriptDraftInput;
  output: ScriptDraftOutput | null;
  status: ScriptDraftStatus;
  provider: string | null;
  referenceVideoIds: string[];
  createdAt: string;
  updatedAt: string;
}
