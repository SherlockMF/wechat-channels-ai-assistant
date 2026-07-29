import fs from "node:fs/promises";
import path from "node:path";
import type {
  ImportedVideoRecord,
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
      cachedState = persisted;
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
      sourceFingerprint: source.fingerprint,
    };
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
  mutationQueue = mutationQueue.then(async () => {
    await fs.mkdir(dataRoot, { recursive: true });
    const state = await readState();
    result = await operation(state);
    const temporaryPath = `${databasePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(temporaryPath, databasePath);
    cachedState = state;
    cachedDatabaseStamp = await databaseStamp();
  });
  await mutationQueue;
  return result;
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
      if (
        videoRecordId &&
        !state.records.some((record) => record.id === videoRecordId)
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
      const records = sortByPublishedAt(
        state.records.filter((record) => videoRecordIds.includes(record.id)),
      );
      const baseline = calculateAccountBaseline(state.records);
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
          result: buildRuleDiagnosis(record, baseline, asset.durationSeconds),
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
      const now = new Date().toISOString();
      const diagnosis = buildRuleDiagnosis(
        record,
        calculateAccountBaseline(state.records),
        asset.durationSeconds,
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
}
