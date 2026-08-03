import fs from "node:fs/promises";
import path from "node:path";
import type {
  DraftCoverBrief,
  DraftReview,
  DraftReviewResult,
  DraftReviewVersion,
  ImportedVideoRecord,
  ScriptDraft,
  ScriptDraftFormat,
  ScriptDraftInput,
  ScriptDraftProcessKind,
  ScriptDraftSmartSubTopic,
  ScriptDraftTopic,
  VideoAsset,
  VideoMatch,
} from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";
import type {
  AnalysisJob,
  AnalysisResultEntry,
  AppState,
  ImportEntry,
} from "@/lib/data/types";
import { calculateAccountBaseline, sortByPublishedAt } from "@/lib/metrics/account";
import { buildRuleDiagnosis } from "@/lib/analysis/rules";
import { diagnosisToMarkdown } from "@/lib/analysis/markdown";
import { selectPreferredAnalysisJob } from "@/lib/data/job-selection";
import { buildVersionChangelog } from "@/lib/draft-review/changelog";
import { resolveCoverBriefProvider } from "@/lib/draft-review/cover-brief-dashscope";
import type { CoverBriefContext } from "@/lib/draft-review/cover-brief-provider";
import { extractDraftEvidence } from "@/lib/draft-review/evidence";
import { resolveDraftReviewProvider } from "@/lib/draft-review/provider";
import { findSimilarVideosByTags } from "@/lib/draft-review/similar-videos";
import {
  applyVersionToDraft,
  canAddDraftVersion,
  migrateDraftReviewVersions,
  versionFromDraftFields,
} from "@/lib/draft-review/versions";
import { draftReviewStorageRoot } from "@/lib/storage/draft-review-storage";
import { defaultTopicForFormat, topicRequired } from "@/lib/script-workbench/catalog";
import {
  resolveDraftListTitle,
  sanitizeGeneratedTitles,
  summarizeIdea,
} from "@/lib/script-workbench/display";
import {
  finalizeScriptOutput,
  sanitizeScriptInput,
} from "@/lib/script-workbench/production-guide";
import { resolveScriptProvider } from "@/lib/script-workbench/provider";
import {
  findScriptReferences,
  formatReferencesForPrompt,
  recordsOwnedBy,
} from "@/lib/script-workbench/references";
import {
  buildLocalSourceState,
  LOCAL_SOURCE_IMPORT_ID,
  localSourcePaths,
  readLocalSourceFingerprint,
} from "@/lib/data/local-source";

const dataRoot = path.join(localSourcePaths().workspaceRoot, ".data");
const databasePath = path.join(dataRoot, "local-state.json");
let mutationQueue = Promise.resolve();
let cachedState: PersistedLocalState | null = null;
let cachedDatabaseStamp: string | null = null;
let cachedSourceCheckedAt = 0;
const SOURCE_CHECK_INTERVAL_MS = 2_000;

async function databaseStamp(): Promise<string | null> {
  try {
    const stat = await fs.stat(databasePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface PersistedLocalState extends AppState {
  sourceFingerprint: string;
}

async function readState(): Promise<PersistedLocalState> {
  const currentDatabaseStamp = await databaseStamp();
  const now = Date.now();
  if (
    cachedState &&
    currentDatabaseStamp === cachedDatabaseStamp &&
    now - cachedSourceCheckedAt < SOURCE_CHECK_INTERVAL_MS
  ) {
    return cachedState;
  }
  const currentSourceFingerprint = await readLocalSourceFingerprint();
  cachedSourceCheckedAt = now;
  if (
    cachedState &&
    currentDatabaseStamp === cachedDatabaseStamp &&
    cachedState.sourceFingerprint === currentSourceFingerprint
  ) {
    return cachedState;
  }
  const source = await buildLocalSourceState();
  try {
    const persisted = JSON.parse(
      await fs.readFile(databasePath, "utf8"),
    ) as PersistedLocalState;
    if (persisted.sourceFingerprint === source.fingerprint) {
      cachedState = {
        ...persisted,
        draftReviews: persisted.draftReviews ?? [],
        draftReviewVersions: persisted.draftReviewVersions ?? [],
        draftResults: persisted.draftResults ?? [],
        draftCoverBriefs: persisted.draftCoverBriefs ?? [],
        scriptDrafts: persisted.scriptDrafts ?? [],
      };
      migrateDraftReviewVersions(cachedState);
      cachedDatabaseStamp = currentDatabaseStamp;
      return cachedState;
    }
    const validRecordIds = new Set(
      source.state.records.map((record) => record.id),
    );
    const preservedJobs = persisted.jobs.filter((job) =>
      validRecordIds.has(job.videoRecordId),
    );
    const preservedJobIds = new Set(preservedJobs.map((job) => job.id));
    cachedState = {
      ...source.state,
      jobs: preservedJobs,
      results: persisted.results.filter((result) =>
        preservedJobIds.has(result.analysisJobId),
      ),
      draftReviews: persisted.draftReviews ?? [],
      draftReviewVersions: persisted.draftReviewVersions ?? [],
      draftResults: persisted.draftResults ?? [],
      draftCoverBriefs: persisted.draftCoverBriefs ?? [],
      scriptDrafts: persisted.scriptDrafts ?? [],
      sourceFingerprint: source.fingerprint,
    };
    migrateDraftReviewVersions(cachedState);
    cachedDatabaseStamp = currentDatabaseStamp;
    return cachedState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cachedState = {
      ...source.state,
      sourceFingerprint: source.fingerprint,
    };
    cachedDatabaseStamp = null;
    return cachedState;
  }
}

async function mutate<T>(operation: (state: AppState) => T | Promise<T>): Promise<T> {
  let result!: T;
  let failure: unknown;
  const run = mutationQueue.then(async () => {
    try {
      await fs.mkdir(dataRoot, { recursive: true });
      const state = await readState();
      result = await operation(state);
      const temporaryPath = `${databasePath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
      await fs.rename(temporaryPath, databasePath);
      cachedState = state;
      cachedDatabaseStamp = await databaseStamp();
    } catch (error) {
      failure = error;
    }
  });
  // 吞掉失败，避免后续写入永久卡死
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
  if (failure) throw failure;
  return result;
}

function normalizeScriptDraft(draft: ScriptDraft): ScriptDraft {
  return {
    ...draft,
    formatOther: draft.formatOther ?? null,
    topicOther: draft.topicOther ?? null,
  };
}

export class LocalRepository {
  async createImport(
    ownerId: string,
    filename: string,
    sheetName: string,
    rowCount: number,
    records: ImportedVideoRecord[],
    invalidRowCount: number,
  ): Promise<ImportEntry> {
    return mutate((state) => {
      const id = createId();
      const entry: ImportEntry = {
        id,
        ownerId,
        originalFilename: filename,
        sheetName,
        rowCount,
        validRowCount: records.length,
        invalidRowCount,
        status: "imported",
        createdAt: new Date().toISOString(),
      };
      state.imports.push(entry);
      state.records.push(...records.map((record) => ({ ...record, importId: id })));
      return entry;
    });
  }

  async rollbackImport(ownerId: string, importId: string): Promise<boolean> {
    if (importId === LOCAL_SOURCE_IMPORT_ID) return false;
    return mutate((state) => {
      const entry = state.imports.find(
        (item) => item.id === importId && item.ownerId === ownerId,
      );
      if (!entry) return false;
      const recordIds = new Set(
        state.records
          .filter((record) => record.importId === importId)
          .map((record) => record.id),
      );
      state.records = state.records.filter(
        (record) => record.importId !== importId,
      );
      state.matches = state.matches.filter(
        (match) => !match.videoRecordId || !recordIds.has(match.videoRecordId),
      );
      entry.status = "rolled_back";
      return true;
    });
  }

  async getImport(ownerId: string, importId: string) {
    const state = await readState();
    const entry = state.imports.find(
      (item) => item.id === importId && item.ownerId === ownerId,
    );
    if (!entry) return null;
    const assets = state.assets.filter((asset) => asset.importId === importId);
    const assetIds = new Set(assets.map((asset) => asset.id));
    return {
      import: entry,
      records: state.records.filter((record) => record.importId === importId),
      assets,
      matches: state.matches.filter((match) => assetIds.has(match.videoAssetId)),
    };
  }

  async getAsset(ownerId: string, assetId: string): Promise<VideoAsset | null> {
    const state = await readState();
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return null;
    const entry = state.imports.find(
      (item) => item.id === asset.importId && item.ownerId === ownerId,
    );
    return entry ? asset : null;
  }

  async addAssetsAndMatches(
    ownerId: string,
    assets: VideoAsset[],
    matches: VideoMatch[],
  ) {
    return mutate((state) => {
      const ownedImportIds = new Set(
        state.imports
          .filter((item) => item.ownerId === ownerId)
          .map((item) => item.id),
      );
      if (assets.some((asset) => !ownedImportIds.has(asset.importId))) {
        throw Object.assign(new Error("不能向其他用户的导入批次添加视频"), {
          status: 403,
        });
      }
      const uploadedAssets = new Map(assets.map((asset) => [asset.id, asset]));
      const invalidMatch = matches.some((match) => {
        const asset = uploadedAssets.get(match.videoAssetId);
        if (!asset) return true;
        if (!match.videoRecordId) return false;
        const record = state.records.find((item) => item.id === match.videoRecordId);
        return !record || record.importId !== asset.importId;
      });
      if (invalidMatch) {
        throw Object.assign(new Error("视频匹配不能跨导入批次"), { status: 403 });
      }
      state.assets.push(...assets);
      state.matches.push(...matches);
      return {
        assets: assets.length,
        matched: matches.filter((item) => item.status === "matched").length,
        needsReview: matches.filter((item) => item.status === "needs_review").length,
        unmatched: matches.filter((item) => item.status === "unmatched").length,
        ownerId,
      };
    });
  }

  async updateAssetCover(
    ownerId: string,
    assetId: string,
    cover: {
      coverPath: string;
      coverSource: "uploaded" | "frame";
      coverFrameSecond: number | null;
    },
  ): Promise<VideoAsset | null> {
    return mutate((state) => {
      const asset = state.assets.find((item) => item.id === assetId);
      if (!asset) return null;
      const entry = state.imports.find(
        (item) => item.id === asset.importId && item.ownerId === ownerId,
      );
      if (!entry) return null;
      Object.assign(asset, cover);
      return asset;
    });
  }

  async confirmMatch(
    ownerId: string,
    matchId: string,
    videoRecordId: string | null,
  ): Promise<VideoMatch | null> {
    return mutate((state) => {
      const match = state.matches.find((item) => item.id === matchId);
      const asset = match
        ? state.assets.find((item) => item.id === match.videoAssetId)
        : null;
      if (!match || !asset) return null;
      const entry = state.imports.find(
        (item) => item.id === asset.importId && item.ownerId === ownerId,
      );
      if (!entry) return null;
      if (
        videoRecordId &&
        !state.records.some(
          (record) => record.id === videoRecordId && record.importId === asset.importId,
        )
      ) {
        return null;
      }
      match.videoRecordId = videoRecordId;
      match.method = "manual";
      match.status = videoRecordId ? "matched" : "unmatched";
      match.confirmedByUser = true;
      match.similarityScore = videoRecordId ? 1 : match.similarityScore;
      return match;
    });
  }

  async listQueue(ownerId: string) {
    const state = await readState();
    const matched = state.matches.filter(
      (match) => match.status === "matched" && match.videoRecordId,
    );
    const rows = matched.flatMap((match) => {
      const record = state.records.find(
        (item) => item.id === match.videoRecordId,
      );
      const asset = state.assets.find((item) => item.id === match.videoAssetId);
      if (!record || !asset) return [];
      const job = selectPreferredAnalysisJob(state.jobs, record.id);
      return [{ record, asset, match, job: job ?? null }];
    });
    return rows
      .filter((row) =>
        state.imports.some(
          (entry) =>
            entry.id === row.record.importId && entry.ownerId === ownerId,
        ),
      )
      .sort(
        (a, b) =>
          new Date(b.record.publishedAt).getTime() -
            new Date(a.record.publishedAt).getTime() ||
          a.record.spreadsheetRow - b.record.spreadsheetRow,
      );
  }

  async createAnalysisJobs(
    ownerId: string,
    videoRecordIds: string[],
  ): Promise<AnalysisJob[]> {
    return mutate((state) => {
      const ownedImportIds = new Set(
        state.imports
          .filter((item) => item.ownerId === ownerId)
          .map((item) => item.id),
      );
      const ownerRecords = state.records.filter((record) =>
        ownedImportIds.has(record.importId),
      );
      const records = sortByPublishedAt(
        ownerRecords.filter((record) => videoRecordIds.includes(record.id)),
      );
      const baseline = calculateAccountBaseline(ownerRecords);
      const jobs = records.flatMap((record) => {
        const match = state.matches.find(
          (item) =>
            item.videoRecordId === record.id && item.status === "matched",
        );
        const asset = match
          ? state.assets.find((item) => item.id === match.videoAssetId)
          : null;
        if (!asset) return [];
        const now = new Date().toISOString();
        const job: AnalysisJob = {
          id: createId(),
          ownerId,
          videoRecordId: record.id,
          videoAssetId: asset.id,
          status: "completed",
          progress: 100,
          currentStep: "local_rule_completed",
          retryCount: 0,
          errorCode: null,
          errorMessage: null,
          startedAt: now,
          completedAt: now,
          createdAt: now,
        };
        state.jobs.push(job);
        state.results.push({
          id: createId(),
          analysisJobId: job.id,
          result: buildRuleDiagnosis(
            record,
            baseline,
            asset.durationSeconds,
            findSimilarVideosByTags(
              ownerRecords.filter((item) => item.id !== record.id),
              { tags: [], title: record.description },
            ),
          ),
          editedMarkdown: null,
          createdAt: now,
          updatedAt: now,
        });
        return [job];
      });
      return jobs;
    });
  }

  async retryJob(ownerId: string, jobId: string): Promise<AnalysisJob | null> {
    return mutate((state) => {
      const job = state.jobs.find(
        (item) => item.id === jobId && item.ownerId === ownerId,
      );
      if (
        !job ||
        (job.status !== "failed" && job.status !== "cancelled")
      ) return null;
      const record = state.records.find(
        (item) => item.id === job.videoRecordId,
      );
      const asset = state.assets.find((item) => item.id === job.videoAssetId);
      if (!record || !asset) return null;
      const ownedImportIds = new Set(
        state.imports
          .filter((item) => item.ownerId === ownerId)
          .map((item) => item.id),
      );
      if (!ownedImportIds.has(record.importId) || !ownedImportIds.has(asset.importId)) {
        return null;
      }
      const ownerRecords = state.records.filter((item) =>
        ownedImportIds.has(item.importId),
      );
      const now = new Date().toISOString();
      const diagnosis = buildRuleDiagnosis(
        record,
        calculateAccountBaseline(ownerRecords),
        asset.durationSeconds,
        findSimilarVideosByTags(
          ownerRecords.filter((item) => item.id !== record.id),
          { tags: [], title: record.description },
        ),
      );
      const result = state.results.find(
        (item) => item.analysisJobId === job.id,
      );
      if (result) {
        result.result = diagnosis;
        result.updatedAt = now;
      } else {
        state.results.push({
          id: createId(),
          analysisJobId: job.id,
          result: diagnosis,
          editedMarkdown: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      job.status = "completed";
      job.progress = 100;
      job.currentStep = "local_rule_completed";
      job.retryCount += 1;
      job.errorCode = null;
      job.errorMessage = null;
      job.startedAt = now;
      job.completedAt = now;
      return job;
    });
  }

  async getVideo(ownerId: string, videoId: string) {
    const state = await readState();
    const record = state.records.find((item) => item.id === videoId);
    if (!record) return null;
    const importEntry = state.imports.find(
      (item) => item.id === record.importId && item.ownerId === ownerId,
    );
    if (!importEntry) return null;
    const match = state.matches.find((item) => item.videoRecordId === videoId);
    const asset = match
      ? state.assets.find((item) => item.id === match.videoAssetId)
      : null;
    const job = selectPreferredAnalysisJob(state.jobs, videoId);
    const result = job
      ? state.results.find((item) => item.analysisJobId === job.id)
      : null;
    const baseline = calculateAccountBaseline(
      state.records.filter((item) => item.importId === record.importId),
    );
    return {
      record,
      asset: asset ?? null,
      match: match ?? null,
      job: job ?? null,
      result: result ?? null,
      baseline,
      analysisMode:
        job?.currentStep === "codex_multimodal_completed"
          ? ("codex_multimodal" as const)
          : ("local_rule" as const),
    };
  }

  async saveEditedReport(
    ownerId: string,
    videoId: string,
    markdown: string,
  ): Promise<AnalysisResultEntry | null> {
    return mutate((state) => {
      const record = state.records.find((item) => item.id === videoId);
      const entry = record
        ? state.imports.find(
            (item) => item.id === record.importId && item.ownerId === ownerId,
          )
        : null;
      const job = selectPreferredAnalysisJob(state.jobs, videoId);
      const result = job
        ? state.results.find((item) => item.analysisJobId === job.id)
        : null;
      if (!entry || !result) return null;
      result.editedMarkdown = markdown;
      result.updatedAt = new Date().toISOString();
      return result;
    });
  }

  async reportMarkdown(ownerId: string, videoId: string): Promise<string | null> {
    const video = await this.getVideo(ownerId, videoId);
    if (!video?.result) return null;
    return (
      video.result.editedMarkdown ??
      diagnosisToMarkdown(
        video.record.description,
        video.record.publishedAt,
        video.result.result,
        video.analysisMode,
      )
    );
  }

  async listDraftReviews(ownerId: string): Promise<DraftReview[]> {
    const state = await readState();
    migrateDraftReviewVersions(state);
    return state.draftReviews
      .filter((item) => item.ownerId === ownerId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async getDraftReview(
    ownerId: string,
    draftReviewId: string,
    options?: { versionId?: string | null },
  ) {
    const state = await readState();
    migrateDraftReviewVersions(state);
    const draft = state.draftReviews.find(
      (item) => item.id === draftReviewId && item.ownerId === ownerId,
    );
    if (!draft) return null;
    const versions = state.draftReviewVersions
      .filter((item) => item.draftReviewId === draftReviewId)
      .sort((a, b) => a.versionNumber - b.versionNumber);
    const versionId =
      options?.versionId ||
      draft.currentVersionId ||
      versions[versions.length - 1]?.id ||
      null;
    const viewing =
      versions.find((item) => item.id === versionId) ??
      versions[versions.length - 1] ??
      null;
    const viewDraft: DraftReview = viewing
      ? {
          ...draft,
          originalFilename: viewing.originalFilename,
          storagePath: viewing.storagePath,
          mimeType: viewing.mimeType,
          fileSize: viewing.fileSize,
          durationSeconds: viewing.durationSeconds,
          width: viewing.width,
          height: viewing.height,
          fps: viewing.fps,
          coverPath: viewing.coverPath,
          coverSource: viewing.coverSource,
          coverFrameSecond: viewing.coverFrameSecond,
          evidencePath: viewing.evidencePath,
          status: viewing.status,
          progress: viewing.progress,
          currentStep: viewing.currentStep,
          errorMessage: viewing.errorMessage,
          completedAt: viewing.completedAt,
          currentVersionId: viewing.id,
        }
      : draft;
    const result = viewing
      ? (state.draftResults.find(
          (item) => item.draftReviewVersionId === viewing.id,
        ) ?? null)
      : null;
    const baselineRecords = draft.baselineImportId
      ? state.records.filter((item) => item.importId === draft.baselineImportId)
      : state.records;
    return {
      draft: viewDraft,
      result,
      versions: versions.map((item) => ({
        id: item.id,
        versionNumber: item.versionNumber,
        status: item.status,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
        originalFilename: item.originalFilename,
      })),
      viewingVersionId: viewing?.id ?? null,
      baseline: calculateAccountBaseline(baselineRecords),
      analysisMode:
        result?.provider === "mock"
          ? ("draft_mock" as const)
          : result?.provider === "dashscope"
            ? ("draft_dashscope" as const)
            : ("draft_provider" as const),
    };
  }

  async createDraftReview(ownerId: string, draft: DraftReview): Promise<DraftReview> {
    return mutate((state) => {
      if (!state.draftReviews) state.draftReviews = [];
      if (!state.draftReviewVersions) state.draftReviewVersions = [];
      if (!state.draftResults) state.draftResults = [];
      const latestImport = [...state.imports]
        .filter((item) => item.ownerId === ownerId && item.status === "imported")
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
      draft.baselineImportId = latestImport?.id ?? null;
      const versionId = draft.currentVersionId || createId();
      draft.currentVersionId = versionId;
      draft.versionCount = draft.versionCount || 1;
      const version = versionFromDraftFields(draft, versionId, 1);
      state.draftReviewVersions.push(version);
      state.draftReviews.push(draft);
      return draft;
    });
  }

  async addDraftReviewVersion(
    ownerId: string,
    draftReviewId: string,
    version: DraftReviewVersion,
    meta?: { title?: string | null; goal?: string | null; tags?: string[] },
  ): Promise<DraftReview | null> {
    return mutate((state) => {
      migrateDraftReviewVersions(state);
      const draft = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (!draft) return null;
      const versions = state.draftReviewVersions.filter(
        (item) => item.draftReviewId === draftReviewId,
      );
      const gate = canAddDraftVersion(versions, draft.status);
      if (!gate.ok) {
        throw Object.assign(new Error(gate.error), { status: gate.status });
      }
      if (meta?.title !== undefined) draft.title = meta.title;
      if (meta?.goal !== undefined) draft.goal = meta.goal;
      if (meta?.tags !== undefined) draft.tags = meta.tags;
      state.draftReviewVersions.push(version);
      applyVersionToDraft(draft, version, versions.length + 1);
      return draft;
    });
  }

  async updateDraftReview(
    ownerId: string,
    draftReviewId: string,
    patch: Partial<DraftReview>,
  ): Promise<DraftReview | null> {
    return mutate((state) => {
      const draft = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (!draft) return null;
      Object.assign(draft, patch);
      const versionId = draft.currentVersionId;
      if (versionId) {
        const version = state.draftReviewVersions.find((item) => item.id === versionId);
        if (version) {
          if ("status" in patch && patch.status !== undefined) version.status = patch.status;
          if ("progress" in patch && patch.progress !== undefined) version.progress = patch.progress;
          if ("currentStep" in patch && patch.currentStep !== undefined) {
            version.currentStep = patch.currentStep;
          }
          if ("errorMessage" in patch) version.errorMessage = patch.errorMessage ?? null;
          if ("evidencePath" in patch) version.evidencePath = patch.evidencePath ?? null;
          if ("durationSeconds" in patch) {
            version.durationSeconds = patch.durationSeconds ?? null;
          }
          if ("completedAt" in patch) version.completedAt = patch.completedAt ?? null;
          if ("coverPath" in patch) version.coverPath = patch.coverPath ?? null;
          if ("coverSource" in patch) version.coverSource = patch.coverSource ?? null;
          if ("coverFrameSecond" in patch) {
            version.coverFrameSecond = patch.coverFrameSecond ?? null;
          }
          if ("storagePath" in patch && patch.storagePath) {
            version.storagePath = patch.storagePath;
          }
          if ("originalFilename" in patch && patch.originalFilename) {
            version.originalFilename = patch.originalFilename;
          }
          if ("mimeType" in patch && patch.mimeType) version.mimeType = patch.mimeType;
          if ("fileSize" in patch && patch.fileSize !== undefined) {
            version.fileSize = patch.fileSize;
          }
          if ("width" in patch) version.width = patch.width ?? null;
          if ("height" in patch) version.height = patch.height ?? null;
          if ("fps" in patch) version.fps = patch.fps ?? null;
        }
      }
      return draft;
    });
  }

  async updateDraftReviewVersion(
    ownerId: string,
    draftReviewId: string,
    versionId: string,
    patch: Partial<DraftReviewVersion>,
  ): Promise<DraftReviewVersion | null> {
    return mutate((state) => {
      const draft = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      const version = state.draftReviewVersions.find(
        (item) => item.id === versionId && item.draftReviewId === draftReviewId,
      );
      if (!draft || !version) return null;
      Object.assign(version, patch);
      if (draft.currentVersionId === versionId) {
        applyVersionToDraft(
          draft,
          version,
          state.draftReviewVersions.filter((item) => item.draftReviewId === draftReviewId)
            .length,
        );
      }
      return version;
    });
  }

  async deleteDraftReview(
    ownerId: string,
    draftReviewId: string,
  ): Promise<boolean> {
    let versionPaths: string[] = [];
    const removed = await mutate((state) => {
      const index = state.draftReviews.findIndex(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (index < 0) return false;
      const versions = state.draftReviewVersions.filter(
        (item) => item.draftReviewId === draftReviewId,
      );
      versionPaths = versions.flatMap((item) =>
        [item.storagePath, item.coverPath, item.evidencePath].filter(
          (value): value is string => Boolean(value),
        ),
      );
      state.draftReviews.splice(index, 1);
      state.draftReviewVersions = state.draftReviewVersions.filter(
        (item) => item.draftReviewId !== draftReviewId,
      );
      state.draftResults = state.draftResults.filter(
        (item) => item.draftReviewId !== draftReviewId,
      );
      state.draftCoverBriefs = (state.draftCoverBriefs ?? []).filter(
        (item) => item.draftReviewId !== draftReviewId,
      );
      return true;
    });
    if (!removed) return false;
    const cleanupTargets = [
      ...versionPaths,
      path.join(draftReviewStorageRoot(), ownerId, draftReviewId),
    ];
    for (const target of cleanupTargets) {
      try {
        await fs.rm(target, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    return true;
  }

  async deleteDraftReviewVersion(
    ownerId: string,
    draftReviewId: string,
    versionId: string,
  ): Promise<DraftReview | null> {
    let cleanupPaths: string[] = [];
    const draft = await mutate((state) => {
      migrateDraftReviewVersions(state);
      const session = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (!session) return null;
      const versions = state.draftReviewVersions.filter(
        (item) => item.draftReviewId === draftReviewId,
      );
      if (versions.length <= 1) {
        throw Object.assign(new Error("至少保留一个版本；删除整条审片请用删除审片"), {
          status: 422,
        });
      }
      const version = versions.find((item) => item.id === versionId);
      if (!version) return null;
      cleanupPaths = [version.storagePath, version.coverPath, version.evidencePath].filter(
        (value): value is string => Boolean(value),
      );
      state.draftReviewVersions = state.draftReviewVersions.filter(
        (item) => item.id !== versionId,
      );
      state.draftResults = state.draftResults.filter(
        (item) => item.draftReviewVersionId !== versionId,
      );
      state.draftCoverBriefs = (state.draftCoverBriefs ?? []).filter(
        (item) => item.versionId !== versionId,
      );
      const remaining = state.draftReviewVersions
        .filter((item) => item.draftReviewId === draftReviewId)
        .sort((a, b) => a.versionNumber - b.versionNumber);
      const nextCurrent = remaining[remaining.length - 1]!;
      applyVersionToDraft(session, nextCurrent, remaining.length);
      return session;
    });
    for (const target of cleanupPaths) {
      try {
        await fs.rm(target, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
    return draft;
  }

  async deleteDraftCoverBrief(
    ownerId: string,
    draftReviewId: string,
    briefId: string,
  ): Promise<boolean> {
    let backgroundPath: string | null = null;
    const removed = await mutate((state) => {
      const draft = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (!draft) return false;
      const briefs = state.draftCoverBriefs ?? [];
      const brief = briefs.find(
        (item) => item.id === briefId && item.draftReviewId === draftReviewId,
      );
      if (!brief) return false;
      backgroundPath = brief.backgroundPath;
      state.draftCoverBriefs = briefs.filter((item) => item.id !== briefId);
      return true;
    });
    if (!removed) return false;
    if (backgroundPath) {
      try {
        await fs.rm(path.dirname(backgroundPath), { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
    return true;
  }

  async saveDraftReviewResult(
    ownerId: string,
    draftReviewId: string,
    result: DraftReviewResult,
  ): Promise<DraftReviewResult | null> {
    return mutate((state) => {
      const draft = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (!draft) return null;
      const existing = state.draftResults.find(
        (item) =>
          item.draftReviewVersionId === result.draftReviewVersionId ||
          (!result.draftReviewVersionId && item.draftReviewId === draftReviewId),
      );
      if (existing) {
        existing.result = result.result;
        existing.provider = result.provider;
        existing.changelog = result.changelog ?? null;
        existing.draftReviewVersionId = result.draftReviewVersionId;
        existing.updatedAt = result.updatedAt;
        if (result.editedMarkdown !== undefined) {
          // keep existing editedMarkdown unless explicitly provided non-null overwrite on first create path
        }
        return existing;
      }
      state.draftResults.push({
        ...result,
        changelog: result.changelog ?? null,
      });
      return result;
    });
  }

  async processDraftReview(
    ownerId: string,
    draftReviewId: string,
    versionId?: string,
  ): Promise<DraftReview | null> {
    const existing = await this.getDraftReview(ownerId, draftReviewId);
    if (!existing) return null;
    const targetVersionId =
      versionId ||
      existing.viewingVersionId ||
      existing.draft.currentVersionId;
    if (!targetVersionId) return null;

    await this.updateDraftReviewVersion(ownerId, draftReviewId, targetVersionId, {
      status: "processing",
      progress: 10,
      currentStep: "extracting_evidence",
      errorMessage: null,
    });

    const payload = await this.getDraftReview(ownerId, draftReviewId, {
      versionId: targetVersionId,
    });
    if (!payload) return null;
    const draft = payload.draft;

    try {
      const versionMeta = payload.versions.find((item) => item.id === targetVersionId);
      const versionNumber = versionMeta?.versionNumber ?? 1;
      const evidenceDirectory = path.join(
        draftReviewStorageRoot(),
        ownerId,
        draftReviewId,
        `v${versionNumber}`,
        "evidence",
      );
      const evidence = await extractDraftEvidence(draft.storagePath, evidenceDirectory, {
        title: draft.title,
        goal: draft.goal,
        tags: draft.tags ?? [],
      });
      await this.updateDraftReviewVersion(ownerId, draftReviewId, targetVersionId, {
        progress: 55,
        currentStep: "analyzing",
        evidencePath: evidenceDirectory,
        durationSeconds: evidence.durationSeconds,
      });

      const state = await readState();
      const baselineRecords = draft.baselineImportId
        ? state.records.filter((item) => item.importId === draft.baselineImportId)
        : state.records;
      const baseline =
        baselineRecords.length > 0
          ? calculateAccountBaseline(baselineRecords)
          : null;
      const similarVideos = findSimilarVideosByTags(baselineRecords, {
        tags: draft.tags ?? [],
        title: draft.title,
      });
      const provider = resolveDraftReviewProvider();
      const diagnosis = await provider.analyze({
        evidence,
        baseline,
        similarVideos,
      });

      const previousVersion = state.draftReviewVersions
        .filter(
          (item) =>
            item.draftReviewId === draftReviewId &&
            item.versionNumber === versionNumber - 1,
        )[0];
      const previousResult = previousVersion
        ? state.draftResults.find(
            (item) => item.draftReviewVersionId === previousVersion.id,
          )
        : null;
      const changelog =
        versionNumber > 1
          ? buildVersionChangelog(previousResult?.result ?? null, diagnosis)
          : null;

      const now = new Date().toISOString();
      await this.saveDraftReviewResult(ownerId, draftReviewId, {
        id: createId(),
        draftReviewId,
        draftReviewVersionId: targetVersionId,
        result: diagnosis,
        editedMarkdown: null,
        provider: provider.resultProviderName ?? provider.name,
        changelog,
        createdAt: now,
        updatedAt: now,
      });
      await this.updateDraftReviewVersion(ownerId, draftReviewId, targetVersionId, {
        status: "completed",
        progress: 100,
        currentStep: "completed",
        completedAt: now,
      });
      return this.getDraftReview(ownerId, draftReviewId).then((item) => item?.draft ?? null);
    } catch (error) {
      await this.updateDraftReviewVersion(ownerId, draftReviewId, targetVersionId, {
        status: "failed",
        progress: 100,
        currentStep: "failed",
        errorMessage:
          error instanceof Error ? error.message : "审片分析失败",
        completedAt: new Date().toISOString(),
      });
      return this.getDraftReview(ownerId, draftReviewId).then((item) => item?.draft ?? null);
    }
  }

  async saveDraftEditedReport(
    ownerId: string,
    draftReviewId: string,
    markdown: string,
    versionId?: string,
  ): Promise<DraftReviewResult | null> {
    return mutate((state) => {
      const draft = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (!draft) return null;
      const targetVersionId = versionId || draft.currentVersionId;
      const result = state.draftResults.find(
        (item) =>
          item.draftReviewVersionId === targetVersionId ||
          (!targetVersionId && item.draftReviewId === draftReviewId),
      );
      if (!result) return null;
      result.editedMarkdown = markdown;
      result.updatedAt = new Date().toISOString();
      return result;
    });
  }

  async draftReportMarkdown(
    ownerId: string,
    draftReviewId: string,
    versionId?: string,
  ): Promise<string | null> {
    const payload = await this.getDraftReview(ownerId, draftReviewId, { versionId });
    if (!payload?.result) return null;
    return (
      payload.result.editedMarkdown ??
      diagnosisToMarkdown(
        payload.draft.title ?? payload.draft.originalFilename,
        payload.draft.createdAt,
        payload.result.result,
        payload.analysisMode,
      )
    );
  }

  async listDraftCoverBriefs(
    ownerId: string,
    draftReviewId: string,
  ): Promise<DraftCoverBrief[]> {
    const state = await readState();
    const draft = state.draftReviews.find(
      (item) => item.id === draftReviewId && item.ownerId === ownerId,
    );
    if (!draft) return [];
    return (state.draftCoverBriefs ?? [])
      .filter((item) => item.draftReviewId === draftReviewId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getDraftCoverBrief(
    ownerId: string,
    draftReviewId: string,
    briefId: string,
  ): Promise<DraftCoverBrief | null> {
    const state = await readState();
    const draft = state.draftReviews.find(
      (item) => item.id === draftReviewId && item.ownerId === ownerId,
    );
    if (!draft) return null;
    return (
      (state.draftCoverBriefs ?? []).find(
        (item) => item.id === briefId && item.draftReviewId === draftReviewId,
      ) ?? null
    );
  }

  async createDraftCoverBrief(
    ownerId: string,
    brief: DraftCoverBrief,
  ): Promise<DraftCoverBrief | null> {
    return mutate((state) => {
      const draft = state.draftReviews.find(
        (item) => item.id === brief.draftReviewId && item.ownerId === ownerId,
      );
      if (!draft) return null;
      if (!state.draftCoverBriefs) state.draftCoverBriefs = [];
      state.draftCoverBriefs.push(brief);
      return brief;
    });
  }

  async updateDraftCoverBrief(
    ownerId: string,
    draftReviewId: string,
    briefId: string,
    patch: Partial<DraftCoverBrief>,
  ): Promise<DraftCoverBrief | null> {
    return mutate((state) => {
      const draft = state.draftReviews.find(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      const brief = (state.draftCoverBriefs ?? []).find(
        (item) => item.id === briefId && item.draftReviewId === draftReviewId,
      );
      if (!draft || !brief) return null;
      Object.assign(brief, patch);
      return brief;
    });
  }

  async processDraftCoverBrief(
    ownerId: string,
    draftReviewId: string,
    briefId: string,
  ): Promise<DraftCoverBrief | null> {
    const brief = await this.getDraftCoverBrief(ownerId, draftReviewId, briefId);
    if (!brief) return null;
    const payload = await this.getDraftReview(ownerId, draftReviewId, {
      versionId: brief.versionId,
    });
    if (!payload) return null;

    const context: CoverBriefContext = {
      title: payload.draft.title,
      tags: payload.draft.tags ?? [],
      goal: payload.draft.goal,
      diagnosisSummary: payload.result?.result.executiveSummary ?? null,
      problemCategories: (payload.result?.result.primaryProblems ?? []).map(
        (item) => item.category,
      ),
    };

    await this.updateDraftCoverBrief(ownerId, draftReviewId, briefId, {
      status: "processing",
      errorMessage: null,
    });

    try {
      const provider = resolveCoverBriefProvider();
      const output = await provider.generate({
        backgroundPath: brief.backgroundPath,
        backgroundMimeType: brief.backgroundMimeType,
        userDescription: brief.userDescription,
        context,
        options: brief.options ?? null,
      });
      const now = new Date().toISOString();
      return this.updateDraftCoverBrief(ownerId, draftReviewId, briefId, {
        imagePrompt: output.pastePrompt,
        titles: output.titles,
        layoutNotes: null,
        provider: provider.name,
        status: "completed",
        errorMessage: null,
        completedAt: now,
      });
    } catch (error) {
      return this.updateDraftCoverBrief(ownerId, draftReviewId, briefId, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "封面方案生成失败",
        completedAt: new Date().toISOString(),
      });
    }
  }

  async listScriptDrafts(ownerId: string): Promise<ScriptDraft[]> {
    const state = await readState();
    return (state.scriptDrafts ?? [])
      .filter((item) => item.ownerId === ownerId)
      .map(normalizeScriptDraft)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getScriptDraft(
    ownerId: string,
    scriptId: string,
  ): Promise<ScriptDraft | null> {
    const state = await readState();
    const draft = (state.scriptDrafts ?? []).find(
      (item) => item.id === scriptId && item.ownerId === ownerId,
    );
    return draft ? normalizeScriptDraft(draft) : null;
  }

  async createScriptDraft(
    ownerId: string,
    draft: ScriptDraft,
  ): Promise<ScriptDraft> {
    return mutate((state) => {
      if (!state.scriptDrafts) state.scriptDrafts = [];
      state.scriptDrafts.push(draft);
      return draft;
    });
  }

  async updateScriptDraft(
    ownerId: string,
    scriptId: string,
    patch: Partial<ScriptDraft>,
  ): Promise<ScriptDraft | null> {
    return mutate((state) => {
      const draft = (state.scriptDrafts ?? []).find(
        (item) => item.id === scriptId && item.ownerId === ownerId,
      );
      if (!draft) return null;
      if (patch.input) {
        patch = { ...patch, input: sanitizeScriptInput(patch.input) };
      }
      const nextStatus = patch.status ?? draft.status;
      const nextOutput =
        patch.output !== undefined ? patch.output : draft.output;
      if (nextStatus === "ready" && nextOutput == null) {
        throw Object.assign(
          new Error("状态为可用时必须有完整输出内容"),
          { status: 400 },
        );
      }
      Object.assign(draft, patch, { updatedAt: new Date().toISOString() });
      return draft;
    });
  }

  async deleteScriptDraft(ownerId: string, scriptId: string): Promise<boolean> {
    return mutate((state) => {
      if (!state.scriptDrafts) state.scriptDrafts = [];
      const index = state.scriptDrafts.findIndex(
        (item) => item.id === scriptId && item.ownerId === ownerId,
      );
      if (index < 0) return false;
      state.scriptDrafts.splice(index, 1);
      return true;
    });
  }

  async generateScriptDraft(
    ownerId: string,
    params: {
      format: ScriptDraftFormat;
      topic?: ScriptDraftTopic | null;
      subTopics?: ScriptDraftSmartSubTopic[];
      processKinds?: ScriptDraftProcessKind[];
      input: ScriptDraftInput;
      title?: string | null;
    },
  ): Promise<ScriptDraft> {
    let topic =
      params.topic === undefined
        ? defaultTopicForFormat(params.format)
        : params.topic;
    if (topicRequired(params.format) && !topic) {
      throw Object.assign(new Error("该制作形态需要选择业务主题"), {
        status: 400,
      });
    }
    const input = sanitizeScriptInput(params.input);
    const state = await readState();
    const refs = findScriptReferences(
      recordsOwnedBy(state.records, state.imports, ownerId),
      params.format,
      topic,
      input.idea,
    );
    const provider = resolveScriptProvider();
    const request = {
      format: params.format,
      topic,
      subTopics: params.subTopics ?? [],
      processKinds: params.processKinds ?? [],
      input,
      referenceHints: formatReferencesForPrompt(refs),
    };
    let output = await provider.generate(request);
    output = finalizeScriptOutput(request, {
      ...output,
      titles: sanitizeGeneratedTitles(output.titles, input.idea),
    });

    const ideaSummary = summarizeIdea({
      idea: input.idea,
      existingScript: input.existingScript,
    });
    const now = new Date().toISOString();
    const draft: ScriptDraft = {
      id: createId(),
      ownerId,
      format: params.format,
      topic,
      formatOther: input.formatOther?.trim() || null,
      topicOther: input.topicOther?.trim() || null,
      subTopics: params.subTopics ?? [],
      processKinds: params.processKinds ?? [],
      title: null,
      ideaSummary,
      input,
      output,
      status: "ready",
      provider: provider.resultProviderName ?? provider.name,
      referenceVideoIds: refs.map((item) => item.videoRecordId),
      createdAt: now,
      updatedAt: now,
    };
    draft.title =
      params.title?.trim() ||
      resolveDraftListTitle(draft) ||
      ideaSummary;
    return this.createScriptDraft(ownerId, draft);
  }

  async regenerateScriptDraft(
    ownerId: string,
    scriptId: string,
  ): Promise<ScriptDraft> {
    const existing = await this.getScriptDraft(ownerId, scriptId);
    if (!existing) {
      throw Object.assign(new Error("脚本不存在"), { status: 404 });
    }
    return this.generateScriptDraft(ownerId, {
      format: existing.format,
      topic: existing.topic,
      subTopics: existing.subTopics,
      processKinds: existing.processKinds,
      input: existing.input,
      title: existing.title,
    });
  }
}
