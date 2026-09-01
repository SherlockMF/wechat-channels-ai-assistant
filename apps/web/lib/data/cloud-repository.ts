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
import { ownerIdFromRequest } from "@/lib/data/owner";
import { findSimilarVideosByTags } from "@/lib/draft-review/similar-videos";
import { buildVersionChangelog } from "@/lib/draft-review/changelog";
import { resolveCoverBriefProvider } from "@/lib/draft-review/cover-brief-dashscope";
import type { CoverBriefContext } from "@/lib/draft-review/cover-brief-provider";
import type { DraftEvidenceManifest } from "@/lib/draft-review/evidence";
import { resolveDraftReviewProvider } from "@/lib/draft-review/provider";
import {
  applyVersionToDraft,
  canAddDraftVersion,
  migrateDraftReviewVersions,
  versionFromDraftFields,
} from "@/lib/draft-review/versions";
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
import { editedSpokenBody } from "@/lib/script-workbench/plain-text";
import { loadUserSettings } from "@/lib/settings/store";
import {
  findScriptReferences,
  formatReferencesForPrompt,
  recordsOwnedBy,
} from "@/lib/script-workbench/references";
import { deletePrivateFiles } from "@/lib/storage/storage";

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface D1DatabaseBinding {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface CloudBindings {
  DB: D1DatabaseBinding;
}

type CollectionName = keyof AppState;
type StateRow = { payload: string };
type CountRow = { collection: CollectionName; count: number };

const collections: CollectionName[] = [
  "imports",
  "records",
  "assets",
  "matches",
  "jobs",
  "results",
  "draftReviews",
  "draftReviewVersions",
  "draftResults",
  "draftCoverBriefs",
  "scriptDrafts",
];
let mutationQueue = Promise.resolve();
let schemaReady: Promise<void> | null = null;

function database(): D1DatabaseBinding {
  const db = (
    globalThis as typeof globalThis & { __SITES_ENV__?: CloudBindings }
  ).__SITES_ENV__?.DB;
  if (!db) throw new Error("Sites D1 binding `DB` 不可用");
  return db;
}

async function ensureSchema(): Promise<void> {
  schemaReady ??= database()
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_state_items (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      )`,
    )
    .run()
    .then(() => undefined);
  await schemaReady;
}

async function readCollection<K extends CollectionName>(
  collection: K,
): Promise<AppState[K]> {
  await ensureSchema();
  const rows = await database()
    .prepare(
      "SELECT payload FROM app_state_items WHERE collection = ? ORDER BY id",
    )
    .bind(collection)
    .all<StateRow>();
  return rows.results.map((row) => JSON.parse(row.payload)) as AppState[K];
}

async function readState(): Promise<AppState> {
  const [
    imports,
    records,
    assets,
    matches,
    jobs,
    results,
    draftReviews,
    draftReviewVersions,
    draftResults,
    draftCoverBriefs,
    scriptDrafts,
  ] = await Promise.all([
    readCollection("imports"),
    readCollection("records"),
    readCollection("assets"),
    readCollection("matches"),
    readCollection("jobs"),
    readCollection("results"),
    readCollection("draftReviews"),
    readCollection("draftReviewVersions"),
    readCollection("draftResults"),
    readCollection("draftCoverBriefs"),
    readCollection("scriptDrafts"),
  ]);
  return {
    imports,
    records,
    assets,
    matches,
    jobs,
    results,
    draftReviews,
    draftReviewVersions,
    draftResults,
    draftCoverBriefs,
    scriptDrafts,
    viralSamples: [],
  };
}

async function replaceCollection<K extends CollectionName>(
  collection: K,
  items: AppState[K],
): Promise<void> {
  await ensureSchema();
  const db = database();
  const statements: D1Statement[] = [
    db.prepare("DELETE FROM app_state_items WHERE collection = ?").bind(
      collection,
    ),
  ];
  for (const item of items) {
    statements.push(
      db
        .prepare(
          "INSERT INTO app_state_items (collection, id, payload) VALUES (?, ?, ?)",
        )
        .bind(collection, item.id, JSON.stringify(item)),
    );
  }
  await db.batch(statements);
}

async function writeChangedCollections(
  before: AppState,
  after: AppState,
): Promise<void> {
  for (const collection of collections) {
    if (JSON.stringify(before[collection]) !== JSON.stringify(after[collection])) {
      await replaceCollection(collection, after[collection]);
    }
  }
}

async function mutate<T>(operation: (state: AppState) => T | Promise<T>): Promise<T> {
  let result!: T;
  let failure: unknown;
  const run = mutationQueue.then(async () => {
    try {
      const state = await readState();
      const before = structuredClone(state);
      result = await operation(state);
      await writeChangedCollections(before, state);
    } catch (error) {
      failure = error;
    }
  });
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
  if (failure) throw failure;
  return result;
}

export async function seedCloudState(state: AppState) {
  for (const collection of collections) {
    await replaceCollection(collection, state[collection]);
  }
  return cloudStateCounts();
}

export async function cloudStateCounts() {
  await ensureSchema();
  const rows = await database()
    .prepare(
      "SELECT collection, COUNT(*) AS count FROM app_state_items GROUP BY collection",
    )
    .all<CountRow>();
  return Object.fromEntries(rows.results.map((row) => [row.collection, row.count]));
}

export class CloudRepository {
  async listOwnerVideoRecords(ownerId: string): Promise<ImportedVideoRecord[]> {
    const state = await readState();
    return recordsOwnedBy(state.records, state.imports, ownerId);
  }

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
    if (importId === "local-source") return false;
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
      if (!job) return null;
      job.status = "queued";
      job.progress = 0;
      job.currentStep = "queued";
      job.retryCount += 1;
      job.errorCode = null;
      job.errorMessage = null;
      job.completedAt = null;
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

  async updateAssetCover(
    _ownerId: string,
    _assetId: string,
    _cover: {
      coverPath: string;
      coverSource: "uploaded" | "frame";
      coverFrameSecond: number | null;
    },
  ): Promise<VideoAsset | null> {
    this.draftReviewUnsupported();
  }

  private draftReviewUnsupported(): never {
    throw new Error("发布前审片当前仅支持 LOCAL 模式");
  }

  async listDraftReviews(_ownerId: string): Promise<DraftReview[]> {
    this.draftReviewUnsupported();
  }

  async getDraftReview(
    _ownerId: string,
    _draftReviewId: string,
    _options?: { versionId?: string | null },
  ): Promise<{
    draft: DraftReview;
    result: DraftReviewResult | null;
    versions: Array<{
      id: string;
      versionNumber: number;
      status: DraftReview["status"];
      createdAt: string;
      completedAt: string | null;
      originalFilename: string;
    }>;
    viewingVersionId: string | null;
    baseline: ReturnType<typeof calculateAccountBaseline>;
    analysisMode: "draft_mock" | "draft_provider" | "draft_dashscope";
  } | null> {
    this.draftReviewUnsupported();
  }

  async createDraftReview(
    _ownerId: string,
    _draft: DraftReview,
  ): Promise<DraftReview> {
    this.draftReviewUnsupported();
  }

  async addDraftReviewVersion(
    _ownerId: string,
    _draftReviewId: string,
    _version: import("@video-diagnosis/shared-types").DraftReviewVersion,
    _meta?: { title?: string | null; goal?: string | null; tags?: string[] },
  ): Promise<DraftReview | null> {
    this.draftReviewUnsupported();
  }

  async updateDraftReview(
    _ownerId: string,
    _draftReviewId: string,
    _patch: Partial<DraftReview>,
  ): Promise<DraftReview | null> {
    this.draftReviewUnsupported();
  }

  async updateDraftReviewVersion(
    _ownerId: string,
    _draftReviewId: string,
    _versionId: string,
    _patch: Partial<import("@video-diagnosis/shared-types").DraftReviewVersion>,
  ): Promise<DraftReviewVersion | null> {
    this.draftReviewUnsupported();
  }

  async deleteDraftReview(
    _ownerId: string,
    _draftReviewId: string,
  ): Promise<boolean> {
    this.draftReviewUnsupported();
  }

  async deleteDraftReviewVersion(
    _ownerId: string,
    _draftReviewId: string,
    _versionId: string,
  ): Promise<DraftReview | null> {
    this.draftReviewUnsupported();
  }

  async saveDraftReviewResult(
    _ownerId: string,
    _draftReviewId: string,
    _result: DraftReviewResult,
  ): Promise<DraftReviewResult | null> {
    this.draftReviewUnsupported();
  }

  async processDraftReview(
    _ownerId: string,
    _draftReviewId: string,
    _versionId?: string,
  ): Promise<DraftReview | null> {
    this.draftReviewUnsupported();
  }

  async saveDraftEditedReport(
    _ownerId: string,
    _draftReviewId: string,
    _markdown: string,
    _versionId?: string,
  ): Promise<DraftReviewResult | null> {
    this.draftReviewUnsupported();
  }

  async draftReportMarkdown(
    _ownerId: string,
    _draftReviewId: string,
    _versionId?: string,
  ): Promise<string | null> {
    this.draftReviewUnsupported();
  }

  async listDraftCoverBriefs(
    _ownerId: string,
    _draftReviewId: string,
  ): Promise<import("@video-diagnosis/shared-types").DraftCoverBrief[]> {
    this.draftReviewUnsupported();
  }

  async getDraftCoverBrief(
    _ownerId: string,
    _draftReviewId: string,
    _briefId: string,
  ): Promise<import("@video-diagnosis/shared-types").DraftCoverBrief | null> {
    this.draftReviewUnsupported();
  }

  async createDraftCoverBrief(
    _ownerId: string,
    _brief: import("@video-diagnosis/shared-types").DraftCoverBrief,
  ): Promise<import("@video-diagnosis/shared-types").DraftCoverBrief | null> {
    this.draftReviewUnsupported();
  }

  async updateDraftCoverBrief(
    _ownerId: string,
    _draftReviewId: string,
    _briefId: string,
    _patch: Partial<import("@video-diagnosis/shared-types").DraftCoverBrief>,
  ): Promise<import("@video-diagnosis/shared-types").DraftCoverBrief | null> {
    this.draftReviewUnsupported();
  }

  async processDraftCoverBrief(
    _ownerId: string,
    _draftReviewId: string,
    _briefId: string,
  ): Promise<import("@video-diagnosis/shared-types").DraftCoverBrief | null> {
    this.draftReviewUnsupported();
  }

  async deleteDraftCoverBrief(
    _ownerId: string,
    _draftReviewId: string,
    _briefId: string,
  ): Promise<boolean> {
    this.draftReviewUnsupported();
  }

  private scriptWorkbenchUnsupported(): never {
    throw new Error("脚本工作台当前仅支持 LOCAL 模式");
  }

  async listScriptDrafts(_ownerId: string): Promise<ScriptDraft[]> {
    this.scriptWorkbenchUnsupported();
  }

  async getScriptDraft(
    _ownerId: string,
    _scriptId: string,
  ): Promise<ScriptDraft | null> {
    this.scriptWorkbenchUnsupported();
  }

  async createScriptDraft(
    _ownerId: string,
    _draft: ScriptDraft,
  ): Promise<ScriptDraft> {
    this.scriptWorkbenchUnsupported();
  }

  async updateScriptDraft(
    _ownerId: string,
    _scriptId: string,
    _patch: Partial<ScriptDraft>,
  ): Promise<ScriptDraft | null> {
    this.scriptWorkbenchUnsupported();
  }

  async deleteScriptDraft(
    _ownerId: string,
    _scriptId: string,
  ): Promise<boolean> {
    this.scriptWorkbenchUnsupported();
  }

  async generateScriptDraft(
    _ownerId: string,
    _params: {
      format: ScriptDraft["format"];
      topic?: ScriptDraft["topic"];
      subTopics?: ScriptDraft["subTopics"];
      processKinds?: ScriptDraft["processKinds"];
      input: ScriptDraft["input"];
      title?: string | null;
    },
  ): Promise<ScriptDraft> {
    this.scriptWorkbenchUnsupported();
  }

  async regenerateScriptDraft(
    _ownerId: string,
    _scriptId: string,
  ): Promise<ScriptDraft> {
    this.scriptWorkbenchUnsupported();
  }
}

function normalizeScriptDraft(draft: ScriptDraft): ScriptDraft {
  return {
    ...draft,
    formatOther: draft.formatOther ?? null,
    topicOther: draft.topicOther ?? null,
    editedPlainText: draft.editedPlainText ?? null,
    parentScriptDraftId: draft.parentScriptDraftId ?? null,
    promptVersion: draft.promptVersion ?? null,
  };
}

function freezeScriptSnapshot(draft: ScriptDraft) {
  return {
    scriptDraftId: draft.id,
    scriptUpdatedAt: draft.updatedAt,
    title: draft.title,
    script:
      draft.editedPlainText?.trim() ||
      draft.output?.script?.trim() ||
      draft.output?.plainText?.trim() ||
      draft.input.existingScript?.trim() ||
      "",
    subtitleBeats: draft.output?.subtitleBeats ?? [],
    researchSnapshotId: draft.input.researchSnapshotId ?? null,
  };
}

class SitesRepository extends CloudRepository {
  async listScriptDrafts(ownerId: string): Promise<ScriptDraft[]> {
    const state = await readState();
    return state.scriptDrafts
      .filter((item) => item.ownerId === ownerId)
      .map(normalizeScriptDraft)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getScriptDraft(ownerId: string, scriptId: string): Promise<ScriptDraft | null> {
    const state = await readState();
    const draft = state.scriptDrafts.find(
      (item) => item.id === scriptId && item.ownerId === ownerId,
    );
    return draft ? normalizeScriptDraft(draft) : null;
  }

  async createScriptDraft(ownerId: string, draft: ScriptDraft): Promise<ScriptDraft> {
    return mutate((state) => {
      if (draft.ownerId !== ownerId) draft.ownerId = ownerId;
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
      const draft = state.scriptDrafts.find(
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
      Object.assign(draft, patch, {
        id: scriptId,
        ownerId,
        updatedAt: new Date().toISOString(),
      });
      return draft;
    });
  }

  async deleteScriptDraft(ownerId: string, scriptId: string): Promise<boolean> {
    return mutate((state) => {
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
      parentScriptDraftId?: string | null;
    },
  ): Promise<ScriptDraft> {
    const topic =
      params.topic === undefined
        ? defaultTopicForFormat(params.format)
        : params.topic;
    if (topicRequired(params.format) && !topic) {
      throw Object.assign(new Error("该制作形态需要选择业务主题"), { status: 400 });
    }
    const input = sanitizeScriptInput(params.input);
    const settings = await loadUserSettings();
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
      contentProfile: settings.contentProfile,
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
      editedPlainText: null,
      parentScriptDraftId: params.parentScriptDraftId ?? null,
      promptVersion: "viral-v2",
      createdAt: now,
      updatedAt: now,
    };
    draft.title =
      params.title?.trim() ||
      resolveDraftListTitle(draft) ||
      ideaSummary;
    return this.createScriptDraft(ownerId, draft);
  }

  async regenerateScriptDraft(ownerId: string, scriptId: string): Promise<ScriptDraft> {
    const existing = await this.getScriptDraft(ownerId, scriptId);
    if (!existing) {
      throw Object.assign(new Error("脚本不存在"), { status: 404 });
    }
    return this.generateScriptDraft(ownerId, {
      format: existing.format,
      topic: existing.topic,
      subTopics: existing.subTopics,
      processKinds: existing.processKinds,
      input: {
        ...existing.input,
        existingScript:
          editedSpokenBody(existing.editedPlainText, existing.output) ||
          existing.input.existingScript,
      },
      title: existing.title,
      parentScriptDraftId: existing.id,
    });
  }

  async listViralSamples(_ownerId: string): Promise<import("@video-diagnosis/shared-types").ViralSample[]> {
    throw Object.assign(new Error("爆款样本库当前仅支持 LOCAL 模式"), {
      status: 501,
    });
  }

  async createViralSample(
    _ownerId: string,
    _input: import("@video-diagnosis/shared-types").ViralSampleCreate,
  ): Promise<import("@video-diagnosis/shared-types").ViralSample> {
    throw Object.assign(new Error("爆款样本库当前仅支持 LOCAL 模式"), {
      status: 501,
    });
  }

  async deleteViralSample(_ownerId: string, _sampleId: string): Promise<boolean> {
    throw Object.assign(new Error("爆款样本库当前仅支持 LOCAL 模式"), {
      status: 501,
    });
  }
}
class DraftSitesRepository extends SitesRepository {
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
      const owned = asset
        ? state.imports.some(
            (item) => item.id === asset.importId && item.ownerId === ownerId,
          )
        : false;
      if (!asset || !owned) return null;
      Object.assign(asset, cover);
      return asset;
    });
  }

  async listDraftReviews(ownerId: string): Promise<DraftReview[]> {
    const state = await readState();
    migrateDraftReviewVersions(state);
    return state.draftReviews
      .filter((item) => item.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    const requestedVersionId =
      options?.versionId ||
      draft.currentVersionId ||
      versions.at(-1)?.id ||
      null;
    const viewing =
      versions.find((item) => item.id === requestedVersionId) ??
      versions.at(-1) ??
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
      ? state.draftResults.find(
          (item) => item.draftReviewVersionId === viewing.id,
        ) ?? null
      : null;
    const ownerRecords = recordsOwnedBy(state.records, state.imports, ownerId);
    const baselineRecords = draft.baselineImportId
      ? ownerRecords.filter((item) => item.importId === draft.baselineImportId)
      : ownerRecords;
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

  async createDraftReview(
    ownerId: string,
    draft: DraftReview,
  ): Promise<DraftReview> {
    return mutate((state) => {
      draft.ownerId = ownerId;
      const latestImport = [...state.imports]
        .filter((item) => item.ownerId === ownerId && item.status === "imported")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      draft.baselineImportId = latestImport?.id ?? null;
      const versionId = draft.currentVersionId || createId();
      draft.currentVersionId = versionId;
      draft.versionCount = draft.versionCount || 1;
      const version = versionFromDraftFields(draft, versionId, 1);
      if (draft.sourceScriptDraftId) {
        const script = state.scriptDrafts.find(
          (item) =>
            item.id === draft.sourceScriptDraftId && item.ownerId === ownerId,
        );
        if (!script) {
          throw Object.assign(new Error("关联脚本不存在"), { status: 404 });
        }
        version.scriptSnapshot = freezeScriptSnapshot(normalizeScriptDraft(script));
      } else {
        draft.sourceScriptDraftId = null;
        version.scriptSnapshot = null;
      }
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
      if (version.scriptSnapshot === undefined) {
        const script = draft.sourceScriptDraftId
          ? state.scriptDrafts.find(
              (item) =>
                item.id === draft.sourceScriptDraftId && item.ownerId === ownerId,
            )
          : null;
        version.scriptSnapshot = script
          ? freezeScriptSnapshot(normalizeScriptDraft(script))
          : null;
      }
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
      const safePatch = { ...patch };
      delete safePatch.id;
      delete safePatch.ownerId;
      Object.assign(draft, safePatch);
      const version = draft.currentVersionId
        ? state.draftReviewVersions.find(
            (item) => item.id === draft.currentVersionId,
          )
        : null;
      if (version) {
        const versionFields: Array<keyof DraftReviewVersion> = [
          "status",
          "progress",
          "currentStep",
          "errorMessage",
          "evidencePath",
          "durationSeconds",
          "completedAt",
          "coverPath",
          "coverSource",
          "coverFrameSecond",
          "storagePath",
          "originalFilename",
          "mimeType",
          "fileSize",
          "width",
          "height",
          "fps",
        ];
        for (const key of versionFields) {
          if (key in safePatch) {
            (version as unknown as Record<string, unknown>)[key] =
              (safePatch as unknown as Record<string, unknown>)[key] ?? null;
          }
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
      const safePatch = { ...patch };
      delete safePatch.id;
      delete safePatch.draftReviewId;
      Object.assign(version, safePatch);
      if (draft.currentVersionId === versionId) {
        applyVersionToDraft(
          draft,
          version,
          state.draftReviewVersions.filter(
            (item) => item.draftReviewId === draftReviewId,
          ).length,
        );
      }
      return version;
    });
  }

  async deleteDraftReview(ownerId: string, draftReviewId: string): Promise<boolean> {
    let paths: Array<string | null> = [];
    const removed = await mutate((state) => {
      const index = state.draftReviews.findIndex(
        (item) => item.id === draftReviewId && item.ownerId === ownerId,
      );
      if (index < 0) return false;
      const versions = state.draftReviewVersions.filter(
        (item) => item.draftReviewId === draftReviewId,
      );
      const briefs = state.draftCoverBriefs.filter(
        (item) => item.draftReviewId === draftReviewId,
      );
      paths = [
        ...versions.flatMap((item) => [
          item.storagePath,
          item.coverPath,
          item.evidencePath,
        ]),
        ...briefs.map((item) => item.backgroundPath),
      ];
      state.draftReviews.splice(index, 1);
      state.draftReviewVersions = state.draftReviewVersions.filter(
        (item) => item.draftReviewId !== draftReviewId,
      );
      state.draftResults = state.draftResults.filter(
        (item) => item.draftReviewId !== draftReviewId,
      );
      state.draftCoverBriefs = state.draftCoverBriefs.filter(
        (item) => item.draftReviewId !== draftReviewId,
      );
      return true;
    });
    if (removed) await deletePrivateFiles(paths);
    return removed;
  }

  async deleteDraftReviewVersion(
    ownerId: string,
    draftReviewId: string,
    versionId: string,
  ): Promise<DraftReview | null> {
    let paths: Array<string | null> = [];
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
        throw Object.assign(
          new Error("至少保留一个版本；删除整条审片请用删除审片"),
          { status: 422 },
        );
      }
      const version = versions.find((item) => item.id === versionId);
      if (!version) return null;
      paths = [version.storagePath, version.coverPath, version.evidencePath];
      state.draftReviewVersions = state.draftReviewVersions.filter(
        (item) => item.id !== versionId,
      );
      state.draftResults = state.draftResults.filter(
        (item) => item.draftReviewVersionId !== versionId,
      );
      state.draftCoverBriefs = state.draftCoverBriefs.filter(
        (item) => item.versionId !== versionId,
      );
      const remaining = state.draftReviewVersions
        .filter((item) => item.draftReviewId === draftReviewId)
        .sort((a, b) => a.versionNumber - b.versionNumber);
      applyVersionToDraft(session, remaining.at(-1)!, remaining.length);
      return session;
    });
    if (draft) await deletePrivateFiles(paths);
    return draft;
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
        (item) => item.draftReviewVersionId === result.draftReviewVersionId,
      );
      if (existing) {
        const editedMarkdown = existing.editedMarkdown;
        Object.assign(existing, result, { editedMarkdown });
        return existing;
      }
      state.draftResults.push(result);
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
      versionId || existing.viewingVersionId || existing.draft.currentVersionId;
    if (!targetVersionId) return null;

    await this.updateDraftReviewVersion(ownerId, draftReviewId, targetVersionId, {
      status: "processing",
      progress: 20,
      currentStep: "analyzing",
      errorMessage: null,
    });
    const payload = await this.getDraftReview(ownerId, draftReviewId, {
      versionId: targetVersionId,
    });
    if (!payload) return null;

    try {
      const state = await readState();
      const version = state.draftReviewVersions.find(
        (item) => item.id === targetVersionId,
      );
      const durationSeconds = Math.max(
        0.1,
        payload.draft.durationSeconds ?? 60,
      );
      const board = payload.draft.coverPath ?? "";
      const evidence: DraftEvidenceManifest = {
        durationSeconds,
        openingBoard: board,
        fullBoard: board,
        combinedBoard: board,
        sceneCutSeconds: [],
        silenceRanges: [],
        title: payload.draft.title,
        goal: payload.draft.goal,
        tags: payload.draft.tags ?? [],
        limitations: [
          "Sites/D1 当前为轻量审片：仅使用封面、标题和账号基线，不含本地 FFmpeg 分镜、ASR 或 OCR 证据。",
        ],
      };
      const ownerRecords = recordsOwnedBy(state.records, state.imports, ownerId);
      const baselineRecords = payload.draft.baselineImportId
        ? ownerRecords.filter(
            (item) => item.importId === payload.draft.baselineImportId,
          )
        : ownerRecords;
      const baseline =
        baselineRecords.length > 0
          ? calculateAccountBaseline(baselineRecords)
          : null;
      const similarVideos = findSimilarVideosByTags(baselineRecords, {
        tags: payload.draft.tags ?? [],
        title: payload.draft.title,
      });
      const provider = resolveDraftReviewProvider();
      const diagnosis = await provider.analyze({
        evidence,
        baseline,
        similarVideos,
        scriptSnapshot: version?.scriptSnapshot ?? null,
        researchSnapshot: null,
      });
      const previousVersion = version
        ? state.draftReviewVersions.find(
            (item) =>
              item.draftReviewId === draftReviewId &&
              item.versionNumber === version.versionNumber - 1,
          )
        : null;
      const previousResult = previousVersion
        ? state.draftResults.find(
            (item) => item.draftReviewVersionId === previousVersion.id,
          )
        : null;
      const changelog =
        version && version.versionNumber > 1
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
        evidencePath: board || null,
        completedAt: now,
      });
    } catch (error) {
      await this.updateDraftReviewVersion(ownerId, draftReviewId, targetVersionId, {
        status: "failed",
        progress: 100,
        currentStep: "failed",
        errorMessage: error instanceof Error ? error.message : "审片分析失败",
        completedAt: new Date().toISOString(),
      });
    }
    return (await this.getDraftReview(ownerId, draftReviewId))?.draft ?? null;
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
        (item) => item.draftReviewVersionId === targetVersionId,
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
}
class FullSitesRepository extends DraftSitesRepository {
  async listDraftCoverBriefs(
    ownerId: string,
    draftReviewId: string,
  ): Promise<DraftCoverBrief[]> {
    const state = await readState();
    const draft = state.draftReviews.find(
      (item) => item.id === draftReviewId && item.ownerId === ownerId,
    );
    if (!draft) return [];
    return state.draftCoverBriefs
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
      state.draftCoverBriefs.find(
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
      const brief = state.draftCoverBriefs.find(
        (item) => item.id === briefId && item.draftReviewId === draftReviewId,
      );
      if (!draft || !brief) return null;
      const safePatch = { ...patch };
      delete safePatch.id;
      delete safePatch.draftReviewId;
      Object.assign(brief, safePatch);
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
      return this.updateDraftCoverBrief(ownerId, draftReviewId, briefId, {
        imagePrompt: output.pastePrompt,
        titles: output.titles,
        layoutNotes: null,
        provider: provider.name,
        status: "completed",
        errorMessage: null,
        completedAt: new Date().toISOString(),
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
      const index = state.draftCoverBriefs.findIndex(
        (item) => item.id === briefId && item.draftReviewId === draftReviewId,
      );
      if (index < 0) return false;
      backgroundPath = state.draftCoverBriefs[index]!.backgroundPath;
      state.draftCoverBriefs.splice(index, 1);
      return true;
    });
    if (removed) await deletePrivateFiles([backgroundPath]);
    return removed;
  }
}
export const repository = new FullSitesRepository();

export function requestOwnerId(request: Request): string {
  return ownerIdFromRequest(request);
}
