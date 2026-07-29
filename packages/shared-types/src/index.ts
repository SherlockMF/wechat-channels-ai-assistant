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
