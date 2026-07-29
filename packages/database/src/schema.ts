import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("analysis_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export const matchStatus = pgEnum("video_match_status", [
  "matched",
  "needs_review",
  "unmatched",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  originalFilename: text("original_filename").notNull(),
  sheetName: text("sheet_name").notNull(),
  rowCount: integer("row_count").notNull(),
  validRowCount: integer("valid_row_count").notNull(),
  invalidRowCount: integer("invalid_row_count").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const videoRecords = pgTable(
  "video_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    spreadsheetRow: integer("spreadsheet_row").notNull(),
    platformVideoId: text("platform_video_id"),
    normalizedPlatformVideoId: text("normalized_platform_video_id"),
    description: text("description").notNull(),
    normalizedDescription: text("normalized_description").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    completionRate: doublePrecision("completion_rate"),
    averageWatchSeconds: doublePrecision("average_watch_seconds"),
    views: integer("views"),
    recommendations: integer("recommendations"),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    follows: integer("follows"),
    shareToChat: integer("share_to_chat"),
    setAsRingtone: integer("set_as_ringtone"),
    setAsStatus: integer("set_as_status"),
    setAsMomentsCover: integer("set_as_moments_cover"),
    wecomLinkClicks: integer("wecom_link_clicks"),
    wecomLinkUsers: integer("wecom_link_users"),
    contactAddCount: integer("contact_add_count"),
    contactAddUsers: integer("contact_add_users"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("video_records_import_platform_id_uq").on(
      table.importId,
      table.normalizedPlatformVideoId,
    ),
    index("video_records_published_idx").on(
      table.importId,
      table.publishedAt,
      table.spreadsheetRow,
    ),
  ],
);

export const videoAssets = pgTable("video_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  importId: uuid("import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade" }),
  originalFilename: text("original_filename").notNull(),
  normalizedFilename: text("normalized_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),
  durationSeconds: doublePrecision("duration_seconds"),
  width: integer("width"),
  height: integer("height"),
  fps: doublePrecision("fps"),
  processingStatus: text("processing_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const videoMatches = pgTable(
  "video_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    videoAssetId: uuid("video_asset_id")
      .notNull()
      .references(() => videoAssets.id, { onDelete: "cascade" }),
    videoRecordId: uuid("video_record_id").references(() => videoRecords.id, {
      onDelete: "set null",
    }),
    method: text("method").notNull(),
    similarityScore: doublePrecision("similarity_score").notNull(),
    status: matchStatus("status").notNull(),
    confirmedByUser: boolean("confirmed_by_user").default(false).notNull(),
    candidatesJson: jsonb("candidates_json").default([]).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("video_matches_asset_uq").on(table.videoAssetId)],
);

export const analysisJobs = pgTable(
  "analysis_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    videoRecordId: uuid("video_record_id")
      .notNull()
      .references(() => videoRecords.id, { onDelete: "cascade" }),
    videoAssetId: uuid("video_asset_id")
      .notNull()
      .references(() => videoAssets.id, { onDelete: "cascade" }),
    status: jobStatus("status").default("queued").notNull(),
    progress: integer("progress").default(0).notNull(),
    currentStep: text("current_step").default("queued").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("analysis_jobs_poll_idx").on(table.status, table.createdAt)],
);

export const videoTranscripts = pgTable("video_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoAssetId: uuid("video_asset_id")
    .notNull()
    .references(() => videoAssets.id, { onDelete: "cascade" }),
  fullText: text("full_text").notNull(),
  language: text("language"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  confidence: doublePrecision("confidence"),
  segmentsJson: jsonb("segments_json").default([]).notNull(),
  userCorrectedText: text("user_corrected_text"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const videoSegments = pgTable("video_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoAssetId: uuid("video_asset_id")
    .notNull()
    .references(() => videoAssets.id, { onDelete: "cascade" }),
  startSecond: doublePrecision("start_second").notNull(),
  endSecond: doublePrecision("end_second").notNull(),
  shotType: text("shot_type").notNull(),
  informationFunction: text("information_function").notNull(),
  visualDescription: text("visual_description").notNull(),
  spokenText: text("spoken_text"),
  subtitleText: text("subtitle_text"),
  audioDescription: text("audio_description"),
  isStatic: boolean("is_static").default(false).notNull(),
  isRepeated: boolean("is_repeated").default(false).notNull(),
  isSilent: boolean("is_silent").default(false).notNull(),
  keyFramePath: text("key_frame_path"),
  confidence: doublePrecision("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const analysisResults = pgTable("analysis_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisJobId: uuid("analysis_job_id")
    .notNull()
    .references(() => analysisJobs.id, { onDelete: "cascade" }),
  dataSummaryJson: jsonb("data_summary_json").notNull(),
  resultJson: jsonb("result_json").notNull(),
  editedMarkdown: text("edited_markdown"),
  limitationsJson: jsonb("limitations_json").default([]).notNull(),
  analysisVersion: text("analysis_version").notNull(),
  ruleEngineVersion: text("rule_engine_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  speechProvider: text("speech_provider").notNull(),
  speechModel: text("speech_model").notNull(),
  visionProvider: text("vision_provider").notNull(),
  visionModel: text("vision_model").notNull(),
  llmProvider: text("llm_provider").notNull(),
  llmModel: text("llm_model").notNull(),
  ...timestamps,
});

export const recommendationFeedback = pgTable("recommendation_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  analysisResultId: uuid("analysis_result_id")
    .notNull()
    .references(() => analysisResults.id, { onDelete: "cascade" }),
  recommendationPath: text("recommendation_path").notNull(),
  status: text("status").notNull(),
  userComment: text("user_comment"),
  editedContent: text("edited_content"),
  ...timestamps,
});

export const retentionDatasets = pgTable("retention_datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoRecordId: uuid("video_record_id")
    .notNull()
    .references(() => videoRecords.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceConfidence: doublePrecision("source_confidence"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const retentionPoints = pgTable(
  "retention_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retentionDatasetId: uuid("retention_dataset_id")
      .notNull()
      .references(() => retentionDatasets.id, { onDelete: "cascade" }),
    second: doublePrecision("second").notNull(),
    retentionRate: doublePrecision("retention_rate").notNull(),
    isEstimated: boolean("is_estimated").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("retention_points_dataset_second_uq").on(
      table.retentionDatasetId,
      table.second,
    ),
  ],
);
