import type {
  DraftReview,
  DraftReviewResult,
  ImportedVideoRecord,
  ScriptDraft,
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
  mutationQueue = mutationQueue.then(async () => {
    const state = await readState();
    const before = structuredClone(state);
    result = await operation(state);
    await writeChangedCollections(before, state);
  });
  await mutationQueue;
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
  ) {
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
  ) {
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

export const repository = new CloudRepository();

export function requestOwnerId(request: Request): string {
  return ownerIdFromRequest(request);
}
