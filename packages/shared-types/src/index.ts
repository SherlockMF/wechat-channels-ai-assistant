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
  /** 证据化的逐时码观察；保留 primaryProblems 作为 Top 3 摘要。 */
  detailedObservations: z
    .array(
      z
        .object({
          startSecond: z.number().nonnegative(),
          endSecond: z.number().positive(),
          evidence: z.array(z.string()).min(1),
          issue: z.string(),
          priority: z.enum(["high", "medium", "low"]),
          recommendation: z.string(),
          replacementExample: z.string(),
          expectedMetric: z.enum([
            "completion_rate",
            "average_watch_seconds",
            "like_rate",
            "comment_rate",
            "share_rate",
            "follow_rate",
          ]),
          confidence: sampleConfidenceSchema,
          nature: z.enum(["fact", "inference"]),
        })
        .refine((value) => value.endSecond > value.startSecond, {
          message: "观察结束时间必须晚于开始时间",
        }),
    )
    .optional(),
  scriptAlignment: z
    .object({
      openingPromise: z.object({
        status: z.enum(["matched", "partial", "missing", "not_available"]),
        expected: z.string(),
        observed: z.string(),
        recommendation: z.string(),
      }),
      coreMessage: z.object({
        status: z.enum(["matched", "partial", "missing", "not_available"]),
        expected: z.string(),
        observed: z.string(),
        recommendation: z.string(),
      }),
      proofAssets: z.object({
        status: z.enum(["matched", "partial", "missing", "not_available"]),
        expected: z.string(),
        observed: z.string(),
        recommendation: z.string(),
      }),
      cta: z.object({
        status: z.enum(["matched", "partial", "missing", "not_available"]),
        expected: z.string(),
        observed: z.string(),
        recommendation: z.string(),
      }),
      omissions: z.array(z.string()).default([]),
      deviations: z.array(z.string()).default([]),
    })
    .optional(),
  publishChecklist: z
    .array(
      z.object({
        item: z.string(),
        status: z.enum(["ready", "fix", "verify"]),
        reason: z.string(),
      }),
    )
    .optional(),
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
  /** 创建版本时冻结的脚本依据，避免后续改稿影响历史审片。 */
  scriptSnapshot?: DraftReviewScriptSnapshot | null;
}

export interface DraftReviewScriptSnapshot {
  scriptDraftId: string;
  scriptUpdatedAt: string;
  title: string | null;
  script: string;
  subtitleBeats: string[];
  researchSnapshotId: string | null;
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
  /** 可选关联的来源脚本；一份脚本可对应多条审片会话。 */
  sourceScriptDraftId?: string | null;
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

export const draftCoverBriefStatusSchema = z.enum([
  "processing",
  "completed",
  "failed",
]);

export type DraftCoverBriefStatus = z.infer<typeof draftCoverBriefStatusSchema>;

/** 审片封面方案：一段可连同图片发给 GPT 的完整提示词 */
export interface DraftCoverBriefOptions {
  /** 视觉风格，预设或自定义文案 */
  style: string | null;
  /** 主题色倾向，预设或自定义文案 */
  themeColor: string | null;
  /** 画幅，预设或自定义如 1:1 */
  aspectRatio: string | null;
  /** 文案调性，预设或自定义 */
  mood: string | null;
  /** 压暗/对比强度，预设或自定义 */
  overlay: string | null;
}

export interface DraftCoverBrief {
  id: string;
  draftReviewId: string;
  versionId: string | null;
  backgroundPath: string;
  backgroundMimeType: string;
  userDescription: string;
  /** 可选控制项；旧数据可能缺失 */
  options: DraftCoverBriefOptions | null;
  /** 完整可粘贴提示词（历史字段名 imagePrompt） */
  imagePrompt: string | null;
  titles: string[];
  /** @deprecated 已并入 imagePrompt，不再单独展示 */
  layoutNotes: string | null;
  provider: string;
  status: DraftCoverBriefStatus;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** 内容赛道；热点过滤与研究检索共用同一份定义。 */
export const trackIdSchema = z.enum([
  "smart_home",
  "water",
  "decoration",
  "appliance",
]);

export type TrackId = z.infer<typeof trackIdSchema>;

/** 工作台支持的目标内容平台；能力目录决定各平台当前能做什么。 */
export const contentPlatformSchema = z.enum([
  "weixin_channels",
  "douyin",
  "xiaohongshu",
  "bilibili",
  "kuaishou",
  "youtube_shorts",
  "tiktok",
  "other",
]);

export type ContentPlatform = z.infer<typeof contentPlatformSchema>;

/**
 * 联网检索只能证明来源可被公开访问，拿不到互动指标；
 * verified_metric 仅用于人工录入的爆款样本。
 */
export const viralResearchEvidenceLevelSchema = z.enum([
  "verified_metric",
  "platform_page",
  "media_article",
  "public_source",
  "account_history",
]);

export const viralResearchItemSchema = z.object({
  id: z.string(),
  // "douyin" retained only so older research snapshots still parse.
  sourceType: z.enum([
    "dashscope",
    "douyin",
    "owned_history",
    "viral_sample",
  ]),
  title: z.string(),
  url: z.string().url().optional(),
  site: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  snippet: z.string().optional(),
  evidenceLevel: viralResearchEvidenceLevelSchema,
  visibleMetrics: z
    .object({
      views: z.number().nonnegative().optional(),
      likes: z.number().nonnegative().optional(),
      comments: z.number().nonnegative().optional(),
      shares: z.number().nonnegative().optional(),
      favorites: z.number().nonnegative().optional(),
      recommends: z.number().nonnegative().optional(),
    })
    .optional(),
  relevanceReasons: z.array(z.string()).default([]),
  trendSignal: z.string().optional(),
  accountFit: z
    .object({
      level: z.enum(["low", "medium", "high", "unknown"]),
      reasons: z.array(z.string()),
    })
    .optional(),
});

export const viralResearchTopicCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  whyNow: z.string(),
  targetAudience: z.string(),
  sourceIds: z.array(z.string()),
  reusableStructures: z.array(z.string()),
  originalAngle: z.string(),
  requiredEvidence: z.array(z.string()),
  productionCost: z.enum(["low", "medium", "high"]),
  risks: z.array(z.string()),
  /** 支撑来源的最强等级；旧快照缺省按 weak 处理。 */
  evidenceStrength: z
    .enum(["platform_sourced", "media_sourced", "weak"])
    .default("weak"),
});

export const viralResearchSnapshotSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  query: z.object({
    topic: z.string(),
    format: z.string().optional(),
    audience: z.string().optional(),
    contentGoal: z.string().optional(),
    region: z.string().optional(),
    targetPlatforms: z.array(contentPlatformSchema).optional(),
    platformOther: z.string().optional(),
  }),
  provider: z.string(),
  searchPerformed: z.boolean(),
  fetchedAt: z.string(),
  expiresAt: z.string(),
  items: z.array(viralResearchItemSchema).max(10),
  topicCards: z.array(viralResearchTopicCardSchema).max(3),
  commonPatterns: z.array(z.string()),
  limitations: z.array(z.string()),
  degradedReason: z.string().nullable().optional(),
});

export type ViralResearchEvidenceLevel = z.infer<
  typeof viralResearchEvidenceLevelSchema
>;
export type ViralResearchItem = z.infer<typeof viralResearchItemSchema>;
export type ViralResearchTopicCard = z.infer<
  typeof viralResearchTopicCardSchema
>;
export type ViralResearchSnapshot = z.infer<
  typeof viralResearchSnapshotSchema
>;

export const hotspotSourceKindSchema = z.enum([
  "platform",
  "rss",
  "atom",
  "json_feed",
  "rsshub",
  "dashscope",
]);

export const hotspotSourceConfigSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  /** rsshub 类型只存路由，运行时拼接 rsshubBaseUrl。 */
  url: z.string().min(1).max(2048),
  kind: hotspotSourceKindSchema,
  enabled: z.boolean().default(true),
});

export const hotspotSourceStatusSchema = z.enum(["ok", "failed", "skipped"]);

export const hotspotSourceReportSchema = z.object({
  sourceId: z.string(),
  sourceName: z.string(),
  status: hotspotSourceStatusSchema,
  itemCount: z.number().int().nonnegative(),
  message: z.string().optional(),
});

export const hotspotItemSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  title: z.string(),
  url: z.string().url(),
  publishedAt: z.string().optional(),
  summary: z.string().optional(),
  trackIds: z.array(trackIdSchema).default([]),
  matchedTerms: z.array(z.string()).default([]),
});

export const hotspotClusterSchema = z.object({
  id: z.string(),
  headline: z.string(),
  itemIds: z.array(z.string()).min(1),
  /** 命中该事件的独立来源数量，热度的主要成分。 */
  sourceCount: z.number().int().positive(),
  firstSeenAt: z.string(),
  latestAt: z.string(),
  heat: z.number(),
  /** 热度分项，旧快照缺省时按零分处理。 */
  scoreBreakdown: z
    .object({
      sourceDiversity: z.number().nonnegative(),
      itemVolume: z.number().nonnegative(),
      recency: z.number().nonnegative(),
      dateConfidence: z.number().nonnegative(),
    })
    .default({
      sourceDiversity: 0,
      itemVolume: 0,
      recency: 0,
      dateConfidence: 0,
    }),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  trackIds: z.array(trackIdSchema).default([]),
});

export const hotspotTopicCardSchema = z.object({
  id: z.string(),
  clusterId: z.string(),
  title: z.string(),
  hook: z.string(),
  whyNow: z.string(),
  targetAudience: z.string(),
  trackIds: z.array(trackIdSchema).default([]),
  shootability: z.enum(["low", "medium", "high"]),
  requiredEvidence: z.array(z.string()).default([]),
  /** 热点可用的时效窗口天数，过期后前端降权。 */
  timeWindowDays: z.number().int().positive().max(30),
  risks: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).min(1),
});

export const hotspotSnapshotSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  fetchedAt: z.string(),
  expiresAt: z.string(),
  sourceReports: z.array(hotspotSourceReportSchema).default([]),
  items: z.array(hotspotItemSchema).max(120),
  clusters: z.array(hotspotClusterSchema).max(120),
  topicCards: z.array(hotspotTopicCardSchema).max(12),
  limitations: z.array(z.string()).max(4).default([]),
  degradedReason: z.string().nullable().optional(),
});

export type HotspotSourceKind = z.infer<typeof hotspotSourceKindSchema>;
export type HotspotSourceConfig = z.infer<typeof hotspotSourceConfigSchema>;
export type HotspotSourceStatus = z.infer<typeof hotspotSourceStatusSchema>;
export type HotspotSourceReport = z.infer<typeof hotspotSourceReportSchema>;
export type HotspotItem = z.infer<typeof hotspotItemSchema>;
export type HotspotCluster = z.infer<typeof hotspotClusterSchema>;
export type HotspotTopicCard = z.infer<typeof hotspotTopicCardSchema>;
export type HotspotSnapshot = z.infer<typeof hotspotSnapshotSchema>;

export const viralSamplePlatformSchema = contentPlatformSchema;

export const viralSampleMetricsSchema = z.object({
  views: z.number().nonnegative().optional(),
  likes: z.number().nonnegative().optional(),
  comments: z.number().nonnegative().optional(),
  shares: z.number().nonnegative().optional(),
  favorites: z.number().nonnegative().optional(),
  recommends: z.number().nonnegative().optional(),
});

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "只允许 http(s) 链接");

/** 人工录入的爆款样本；REAL/Sites 暂不支持持久化。 */
const viralSampleContentSchema = z
  .object({
    url: httpUrlSchema,
    title: z.string().trim().min(1).max(200),
    platform: viralSamplePlatformSchema,
    platformOther: z.string().trim().min(1).max(60).optional(),
    visibleMetrics: viralSampleMetricsSchema.optional(),
    notes: z.string().trim().max(2000).optional(),
    /** 可选的结构拆解备注（钩子、节奏等），不自动生成数字。 */
    structureNotes: z.string().trim().max(4000).optional(),
  })
  .superRefine((sample, ctx) => {
    if (sample.platform === "other" && !sample.platformOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platformOther"],
        message: "选择其他平台时必须填写平台名称",
      });
    }
  });

export const viralSampleSchema = viralSampleContentSchema.and(
  z.object({
    id: z.string().uuid(),
    ownerId: z.string(),
    metricsSource: z.literal("manual"),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

export const viralSampleCreateSchema = viralSampleContentSchema;

export type ViralSamplePlatform = z.infer<typeof viralSamplePlatformSchema>;
export type ViralSample = z.infer<typeof viralSampleSchema>;
export type ViralSampleCreate = z.infer<typeof viralSampleCreateSchema>;

export const scriptDraftFormatSchema = z.enum([
  "koubo",
  "showroom_koubo",
  "service_intro",
  "project_finish",
  "hydro_site",
  "service_process",
  "vlog",
  "other",
]);

export const scriptDraftTopicSchema = z.enum([
  "smart_home",
  "water",
  "hydro",
  "service",
  "other",
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
export const scriptShootStatusSchema = z.enum(["shot", "unshot"]);

export const scriptProductionGuideSchema = z
  .object({
    shootStatus: scriptShootStatusSchema,
    /** 剪辑建议：节奏、转场、字幕卡点、BGM、删补等 */
    editGuidance: z.array(z.string()),
    /** 已拍摄：按段落的视频素材描述；未拍摄为空数组 */
    materials: z.array(
      z.object({
        section: z.string(),
        description: z.string(),
      }),
    ),
    /** 未拍摄：拍摄分镜；已拍摄为空数组 */
    storyboard: z.array(
      z.object({
        order: z.number().int(),
        shot: z.string(),
        camera: z.string(),
        durationHint: z.string(),
        voiceCue: z.string(),
      }),
    ),
  })
  .superRefine((guide, ctx) => {
    if (guide.shootStatus === "shot" && guide.storyboard.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "已拍摄状态不应包含 storyboard",
        path: ["storyboard"],
      });
    }
    if (guide.shootStatus === "unshot" && guide.materials.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "未拍摄状态不应包含 materials",
        path: ["materials"],
      });
    }
  });

export const scriptRewriteModeSchema = z.enum(["preserve", "polish", "deep"]);

export const scriptViralPlanSchema = z.object({
  researchStatus: z.enum(["verified", "unverified", "skipped"]),
  topicAngle: z.string(),
  whyNow: z.string(),
  targetAudience: z.string(),
  hookMechanisms: z
    .array(
      z.object({
        mechanism: z.enum([
          "result",
          "loss_aversion",
          "contrarian",
          "checklist",
          "real_case",
          "new_technology",
          "custom",
        ]),
        hook: z.string(),
      }),
    )
    .max(3),
  coverCopy: z.string(),
  evidenceBeats: z.array(
    z.object({
      section: z.string(),
      claim: z.string(),
      evidenceNeeded: z.string(),
      voiceover: z.string().optional(),
      visual: z.string().optional(),
      subtitle: z.string().optional(),
      audio: z.string().optional(),
    }),
  ),
  publishingMetrics: z.array(
    z.object({
      metric: z.string(),
      hypothesis: z.string(),
    }),
  ),
  sourceIds: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const scriptReviewSchema = z.object({
  summary: z.string(),
  lineIssues: z.array(
    z.object({
      original: z.string(),
      problem: z.string(),
      replacement: z.string(),
      reason: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ),
  consistency: z.object({
    titleToOpening: z.string(),
    openingToBody: z.string(),
    bodyToCta: z.string(),
  }),
  claimsToVerify: z.array(
    z.object({
      claim: z.string(),
      risk: z.string(),
      safeWording: z.string(),
    }),
  ),
  originality: z.string(),
  abTests: z.array(
    z.object({
      variable: z.string(),
      variantA: z.string(),
      variantB: z.string(),
      metric: z.string(),
    }),
  ),
});

export const scriptDeliveryGuideSchema = z.object({
  version: z.literal(1),
  source: z.enum(["ai", "rules"]).optional(),
  model: z.string().max(200).optional(),
  generatedAt: z.string().optional(),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  overallTone: z.string().max(200),
  paceHint: z.string().max(300).optional(),
  cameraNote: z.string().max(300).optional(),
  overallPace: z.enum(["slow", "normal", "fast"]),
  rehearsalNotes: z.array(z.string().max(300)).max(8),
  blocks: z.array(
    z.object({
      kind: z.enum(["script", "timeline_say"]),
      order: z.number().int().positive().optional(),
      sourceText: z.string().max(20_000),
      sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
      segments: z.array(
        z.object({
          text: z.string().max(2_000),
          /** 数字、英文、型号和符号展开后的实际念法；普通中文可与 text 相同。 */
          spokenAs: z.string().max(4_000),
          pace: z.enum(["slow", "normal", "fast"]),
          emotion: z.enum([
            "neutral",
            "warm",
            "confident",
            "serious",
            "surprised",
            "questioning",
            "reassuring",
          ]),
          intensity: z.number().int().min(1).max(3),
          toneHint: z.string().max(300).optional(),
          pauseHint: z.string().max(300).optional(),
          expression: z.string().max(300).optional(),
          emphasis: z.array(z.string().max(100)).max(8),
          pauseAfter: z.enum(["none", "micro", "short", "medium", "long"]),
          breathBefore: z.boolean(),
          pronunciation: z
            .array(
              z.object({
                text: z.string().max(100),
                spokenAs: z.string().max(200),
                pinyin: z.string().max(200).optional(),
                needsReview: z.boolean(),
                note: z.string().max(300).optional(),
              }),
            )
            .max(24),
          action: z.string().max(300).optional(),
        }),
      ).max(240),
    }),
  ).max(120),
  warnings: z.array(z.string().max(300)).max(8),
});

/** LLM 解析用：允许脏 productionGuide，随后由 finalize 归一化 */
export const scriptDraftOutputLooseSchema = z.object({
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
  productionGuide: z
    .object({
      shootStatus: scriptShootStatusSchema,
      editGuidance: z.array(z.string()),
      materials: z.array(
        z.object({
          section: z.string(),
          description: z.string(),
        }),
      ),
      storyboard: z.array(
        z.object({
          order: z.number().int(),
          shot: z.string(),
          camera: z.string(),
          durationHint: z.string(),
          voiceCue: z.string(),
        }),
      ),
    })
    .optional(),
  viralPlan: scriptViralPlanSchema.optional(),
  scriptReview: scriptReviewSchema.optional(),
  deliveryGuide: scriptDeliveryGuideSchema.optional(),
  plainText: z.string(),
});

export const scriptDraftInputSchema = z.object({
  idea: z.string().min(1),
  creatorSectionId: z.string().trim().min(1).max(128).optional(),
  creatorSectionInputs: z.record(z.string().max(80), z.string().max(6000))
    .refine((fields) => Object.keys(fields).length <= 20, "栏目字段不能超过 20 个")
    .optional(),
  creatorTopicId: z.string().trim().min(1).max(128).optional(),
  /** 已写好的口播/分镜稿；有则优先润色与配素材，少重写 */
  existingScript: z.string().optional(),
  /** 整片拍摄状态；缺省按未拍摄处理 */
  shootStatus: scriptShootStatusSchema.optional(),
  /** 已拍摄时可选：手头素材描述 */
  materialNotes: z.string().optional(),
  sellingPoints: z.string().optional(),
  targetSeconds: z.number().int().positive().optional(),
  tone: z.enum(["casual", "dry", "other"]).optional(),
  toneOther: z.string().optional(),
  formatOther: z.string().optional(),
  topicOther: z.string().optional(),
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
  audience: z.string().optional(),
  contentGoal: z
    .enum(["lead_generation", "engagement", "education", "brand", "other"])
    .optional(),
  rewriteMode: scriptRewriteModeSchema.optional(),
  ctaGoal: z.string().optional(),
  claimEvidence: z.string().optional(),
  researchSnapshotId: z.string().optional(),
  selectedTopicCardId: z.string().optional(),
  selectedResearchItemIds: z.array(z.string()).max(5).optional(),
  /** 由热点工作台带入；热点选题卡与其引用来源随快照读取。 */
  hotspotSnapshotId: z.string().optional(),
  hotspotClusterId: z.string().optional(),
  hotspotTopicCardId: z.string().optional(),
  /** 缺省时使用设置中的账号画像默认平台。 */
  targetPlatforms: z.array(contentPlatformSchema).min(1).max(4).optional(),
  /** targetPlatforms 包含 other 时的展示名称。 */
  platformOther: z.string().trim().max(60).optional(),
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
  /** 拍摄与剪辑指导；旧稿可缺省 */
  productionGuide: scriptProductionGuideSchema.optional(),
  /** 联网依据与账号适配拆解；旧稿可缺省。 */
  viralPlan: scriptViralPlanSchema.optional(),
  /** 第二遍低温质检结果；旧稿可缺省。 */
  scriptReview: scriptReviewSchema.optional(),
  /** 最终口播的排练与逐词读法攻略；旧稿可缺省。 */
  deliveryGuide: scriptDeliveryGuideSchema.optional(),
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
export type ScriptShootStatus = z.infer<typeof scriptShootStatusSchema>;
export type ScriptRewriteMode = z.infer<typeof scriptRewriteModeSchema>;
export type ScriptProductionGuide = z.infer<typeof scriptProductionGuideSchema>;
export type ScriptViralPlan = z.infer<typeof scriptViralPlanSchema>;
export type ScriptReview = z.infer<typeof scriptReviewSchema>;
export type ScriptDeliveryGuide = z.infer<typeof scriptDeliveryGuideSchema>;
export type ScriptDraftInput = z.infer<typeof scriptDraftInputSchema>;
export type ScriptDraftOutput = z.infer<typeof scriptDraftOutputSchema>;

export interface ScriptAccountProfileSnapshot {
  accountName: string;
  brandName: string;
  region: string;
  positioning: string;
  audiences: string[];
  toneGuide: string;
  ctaPolicy: string;
  themeKeywords: string[];
  defaultPlatforms: ContentPlatform[];
  otherPlatformName: string;
}

export interface ScriptCreatorContextSnapshot {
  topic?: { id: string; subject: string; note: string; source: string } | null;
  capturedAt: string;
  styleDigest: string;
  styleExcerpts: string[];
  materials: Array<{ id: string; title: string; kind: string; body: string }>;
  section: {
    id: string;
    name: string;
    purpose: string;
    guide: string;
    fields: Array<{ id: string; label: string; required: boolean }>;
  } | null;
  sectionInputs: Record<string, string>;
}

export interface ScriptDraft {
  id: string;
  ownerId: string;
  format: ScriptDraftFormat;
  topic: ScriptDraftTopic | null;
  /** format=other 时的自定义形态名称 */
  formatOther: string | null;
  /** topic=other 时的自定义主题名称 */
  topicOther: string | null;
  subTopics: ScriptDraftSmartSubTopic[];
  processKinds: ScriptDraftProcessKind[];
  title: string | null;
  ideaSummary: string;
  input: ScriptDraftInput;
  output: ScriptDraftOutput | null;
  status: ScriptDraftStatus;
  provider: string | null;
  referenceVideoIds: string[];
  /** 人工编辑稿；结构化 output 保留为不可变生成快照。 */
  editedPlainText?: string | null;
  /** 再生成的父稿，便于追踪 lineage。 */
  parentScriptDraftId?: string | null;
  promptVersion?: string | null;
  accountProfileSnapshot?: ScriptAccountProfileSnapshot | null;
  creatorContextSnapshot?: ScriptCreatorContextSnapshot | null;
  rehearsalGuide?: ScriptDeliveryGuide | null;
  createdAt: string;
  updatedAt: string;
}
