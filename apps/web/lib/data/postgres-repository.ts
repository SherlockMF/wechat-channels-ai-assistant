import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  imports as importsTable,
  videoRecords as videoRecordsTable,
} from "@video-diagnosis/database";
import type {
  DiagnosisResult,
  ImportedVideoRecord,
  VideoAsset,
  VideoMatch,
} from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";
import { diagnosisToMarkdown } from "@/lib/analysis/markdown";
import { calculateAccountBaseline } from "@/lib/metrics/account";
import type {
  AnalysisJob,
  AnalysisResultEntry,
  ImportEntry,
} from "@/lib/data/types";

type DatabaseRow = Record<string, unknown>;

function importEntry(row: DatabaseRow): ImportEntry {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id ?? row.ownerId),
    originalFilename: String(row.original_filename ?? row.originalFilename),
    sheetName: String(row.sheet_name ?? row.sheetName),
    rowCount: Number(row.row_count ?? row.rowCount),
    validRowCount: Number(row.valid_row_count ?? row.validRowCount),
    invalidRowCount: Number(row.invalid_row_count ?? row.invalidRowCount),
    status: String(row.status) as ImportEntry["status"],
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
  };
}

function videoRecord(row: DatabaseRow): ImportedVideoRecord {
  return {
    id: String(row.id),
    importId: String(row.import_id),
    spreadsheetRow: Number(row.spreadsheet_row),
    platformVideoId: row.platform_video_id ? String(row.platform_video_id) : null,
    normalizedPlatformVideoId: row.normalized_platform_video_id
      ? String(row.normalized_platform_video_id)
      : null,
    description: String(row.description),
    normalizedDescription: String(row.normalized_description),
    publishedAt: new Date(String(row.published_at)).toISOString(),
    completionRate:
      row.completion_rate === null ? null : Number(row.completion_rate),
    averageWatchSeconds:
      row.average_watch_seconds === null
        ? null
        : Number(row.average_watch_seconds),
    views: row.views === null ? null : Number(row.views),
    recommendations:
      row.recommendations === null ? null : Number(row.recommendations),
    likes: row.likes === null ? null : Number(row.likes),
    comments: row.comments === null ? null : Number(row.comments),
    shares: row.shares === null ? null : Number(row.shares),
    follows: row.follows === null ? null : Number(row.follows),
    shareToChat:
      row.share_to_chat === null ? null : Number(row.share_to_chat),
    setAsRingtone:
      row.set_as_ringtone === null ? null : Number(row.set_as_ringtone),
    setAsStatus: row.set_as_status === null ? null : Number(row.set_as_status),
    setAsMomentsCover:
      row.set_as_moments_cover === null
        ? null
        : Number(row.set_as_moments_cover),
    wecomLinkClicks:
      row.wecom_link_clicks === null ? null : Number(row.wecom_link_clicks),
    wecomLinkUsers:
      row.wecom_link_users === null ? null : Number(row.wecom_link_users),
    contactAddCount:
      row.contact_add_count === null ? null : Number(row.contact_add_count),
    contactAddUsers:
      row.contact_add_users === null ? null : Number(row.contact_add_users),
  };
}

function videoAsset(row: DatabaseRow): VideoAsset {
  return {
    id: String(row.id),
    importId: String(row.import_id),
    originalFilename: String(row.original_filename),
    normalizedFilename: String(row.normalized_filename),
    storagePath: String(row.storage_path),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    lastModifiedAt: row.last_modified_at
      ? new Date(String(row.last_modified_at)).toISOString()
      : null,
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    fps: row.fps === null ? null : Number(row.fps),
    processingStatus: String(row.processing_status),
  };
}

function videoMatch(row: DatabaseRow): VideoMatch {
  return {
    id: String(row.id),
    videoAssetId: String(row.video_asset_id),
    videoRecordId: row.video_record_id ? String(row.video_record_id) : null,
    method: String(row.method) as VideoMatch["method"],
    similarityScore: Number(row.similarity_score),
    status: String(row.status) as VideoMatch["status"],
    confirmedByUser: Boolean(row.confirmed_by_user),
    candidates: (row.candidates_json ?? []) as VideoMatch["candidates"],
  };
}

function analysisJob(row: DatabaseRow): AnalysisJob {
  return {
    id: String(row.job_id ?? row.id),
    ownerId: String(row.job_owner_id ?? row.owner_id),
    videoRecordId: String(row.job_video_record_id ?? row.video_record_id),
    videoAssetId: String(row.job_video_asset_id ?? row.video_asset_id),
    status: String(row.job_status ?? row.status) as AnalysisJob["status"],
    progress: Number(row.job_progress ?? row.progress ?? 0),
    currentStep: String(row.job_current_step ?? row.current_step ?? "queued"),
    retryCount: Number(row.job_retry_count ?? row.retry_count ?? 0),
    errorCode: row.job_error_code
      ? String(row.job_error_code)
      : row.error_code
        ? String(row.error_code)
        : null,
    errorMessage: row.job_error_message
      ? String(row.job_error_message)
      : row.error_message
        ? String(row.error_message)
        : null,
    startedAt: (row.job_started_at ?? row.started_at)
      ? new Date(String(row.job_started_at ?? row.started_at)).toISOString()
      : null,
    completedAt: (row.job_completed_at ?? row.completed_at)
      ? new Date(String(row.job_completed_at ?? row.completed_at)).toISOString()
      : null,
    createdAt: new Date(
      String(row.job_created_at ?? row.created_at),
    ).toISOString(),
  };
}

export class PostgresRepository {
  private readonly pool: Pool;
  private readonly db: ReturnType<typeof drizzle>;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("REAL 模式必须配置 DATABASE_URL");
    }
    this.pool = new Pool({ connectionString, max: 10 });
    this.db = drizzle(this.pool);
  }

  async createImport(
    ownerId: string,
    filename: string,
    sheetName: string,
    rowCount: number,
    records: ImportedVideoRecord[],
    invalidRowCount: number,
  ): Promise<ImportEntry> {
    return this.db.transaction(async (transaction) => {
      const [entry] = await transaction
        .insert(importsTable)
        .values({
          ownerId,
          originalFilename: filename,
          sheetName,
          rowCount,
          validRowCount: records.length,
          invalidRowCount,
          status: "imported",
        })
        .returning();
      if (!entry) throw new Error("创建导入批次失败");
      await transaction.insert(videoRecordsTable).values(
        records.map((record) => ({
          id: record.id,
          ownerId,
          importId: entry.id,
          spreadsheetRow: record.spreadsheetRow,
          platformVideoId: record.platformVideoId,
          normalizedPlatformVideoId: record.normalizedPlatformVideoId,
          description: record.description,
          normalizedDescription: record.normalizedDescription,
          publishedAt: new Date(record.publishedAt),
          completionRate: record.completionRate,
          averageWatchSeconds: record.averageWatchSeconds,
          views: record.views,
          recommendations: record.recommendations,
          likes: record.likes,
          comments: record.comments,
          shares: record.shares,
          follows: record.follows,
          shareToChat: record.shareToChat,
          setAsRingtone: record.setAsRingtone,
          setAsStatus: record.setAsStatus,
          setAsMomentsCover: record.setAsMomentsCover,
          wecomLinkClicks: record.wecomLinkClicks,
          wecomLinkUsers: record.wecomLinkUsers,
          contactAddCount: record.contactAddCount,
          contactAddUsers: record.contactAddUsers,
        })),
      );
      return {
        id: entry.id,
        ownerId: entry.ownerId,
        originalFilename: entry.originalFilename,
        sheetName: entry.sheetName,
        rowCount: entry.rowCount,
        validRowCount: entry.validRowCount,
        invalidRowCount: entry.invalidRowCount,
        status: entry.status as ImportEntry["status"],
        createdAt: entry.createdAt.toISOString(),
      };
    });
  }

  async rollbackImport(ownerId: string, importId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE imports SET status='rolled_back' WHERE id=$1 AND owner_id=$2 RETURNING id",
        [importId, ownerId],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query("DELETE FROM video_assets WHERE import_id=$1", [
        importId,
      ]);
      await client.query("DELETE FROM video_records WHERE import_id=$1", [
        importId,
      ]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getImport(ownerId: string, importId: string) {
    const entryResult = await this.pool.query(
      "SELECT * FROM imports WHERE id=$1 AND owner_id=$2",
      [importId, ownerId],
    );
    if (!entryResult.rows[0]) return null;
    const [recordsResult, assetsResult, matchesResult] = await Promise.all([
      this.pool.query(
        "SELECT * FROM video_records WHERE import_id=$1 ORDER BY spreadsheet_row",
        [importId],
      ),
      this.pool.query(
        "SELECT * FROM video_assets WHERE import_id=$1 ORDER BY created_at",
        [importId],
      ),
      this.pool.query(
        `SELECT m.* FROM video_matches m
         JOIN video_assets a ON a.id=m.video_asset_id
         WHERE a.import_id=$1 ORDER BY m.created_at`,
        [importId],
      ),
    ]);
    return {
      import: importEntry(entryResult.rows[0]),
      records: recordsResult.rows.map(videoRecord),
      assets: assetsResult.rows.map(videoAsset),
      matches: matchesResult.rows.map(videoMatch),
    };
  }

  async getAsset(ownerId: string, assetId: string): Promise<VideoAsset | null> {
    const result = await this.pool.query(
      `SELECT a.* FROM video_assets a
       JOIN imports i ON i.id=a.import_id
       WHERE a.id=$1 AND i.owner_id=$2`,
      [assetId, ownerId],
    );
    return result.rows[0] ? videoAsset(result.rows[0]) : null;
  }

  async addAssetsAndMatches(
    ownerId: string,
    assets: VideoAsset[],
    matches: VideoMatch[],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const asset of assets) {
        await client.query(
          `INSERT INTO video_assets
           (id,owner_id,import_id,original_filename,normalized_filename,storage_path,
            mime_type,file_size,last_modified_at,duration_seconds,width,height,fps,
            processing_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            asset.id,
            ownerId,
            asset.importId,
            asset.originalFilename,
            asset.normalizedFilename,
            asset.storagePath,
            asset.mimeType,
            asset.fileSize,
            asset.lastModifiedAt,
            asset.durationSeconds,
            asset.width,
            asset.height,
            asset.fps,
            asset.processingStatus,
          ],
        );
      }
      for (const match of matches) {
        await client.query(
          `INSERT INTO video_matches
           (id,owner_id,video_asset_id,video_record_id,method,similarity_score,
            status,confirmed_by_user,candidates_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [
            match.id,
            ownerId,
            match.videoAssetId,
            match.videoRecordId,
            match.method,
            match.similarityScore,
            match.status,
            match.confirmedByUser,
            JSON.stringify(match.candidates),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return {
      assets: assets.length,
      matched: matches.filter((item) => item.status === "matched").length,
      needsReview: matches.filter((item) => item.status === "needs_review")
        .length,
      unmatched: matches.filter((item) => item.status === "unmatched").length,
      ownerId,
    };
  }

  async confirmMatch(
    ownerId: string,
    matchId: string,
    videoRecordId: string | null,
  ): Promise<VideoMatch | null> {
    const ownership = await this.pool.query(
      `SELECT m.*, a.import_id FROM video_matches m
       JOIN video_assets a ON a.id=m.video_asset_id
       WHERE m.id=$1 AND m.owner_id=$2`,
      [matchId, ownerId],
    );
    const current = ownership.rows[0];
    if (!current) return null;
    if (videoRecordId) {
      const record = await this.pool.query(
        "SELECT id FROM video_records WHERE id=$1 AND import_id=$2 AND owner_id=$3",
        [videoRecordId, current.import_id, ownerId],
      );
      if (!record.rowCount) return null;
    }
    const result = await this.pool.query(
      `UPDATE video_matches
       SET video_record_id=$1, method='manual',
           status=$2::video_match_status, confirmed_by_user=true,
           similarity_score=CASE WHEN $1::uuid IS NULL THEN similarity_score ELSE 1 END,
           updated_at=now()
       WHERE id=$3 AND owner_id=$4 RETURNING *`,
      [videoRecordId, videoRecordId ? "matched" : "unmatched", matchId, ownerId],
    );
    return result.rows[0] ? videoMatch(result.rows[0]) : null;
  }

  async listQueue(ownerId: string) {
    const result = await this.pool.query(
      `SELECT
         r.*, a.id AS asset_id, a.import_id AS asset_import_id,
         a.original_filename AS asset_original_filename,
         a.normalized_filename AS asset_normalized_filename,
         a.storage_path AS asset_storage_path, a.mime_type AS asset_mime_type,
         a.file_size AS asset_file_size, a.last_modified_at AS asset_last_modified_at,
         a.duration_seconds AS asset_duration_seconds, a.width AS asset_width,
         a.height AS asset_height, a.fps AS asset_fps,
         a.processing_status AS asset_processing_status,
         m.id AS match_id, m.method AS match_method,
         m.similarity_score AS match_similarity_score,
         m.status AS match_status, m.confirmed_by_user AS match_confirmed_by_user,
         m.candidates_json AS match_candidates_json,
         j.id AS job_id, j.owner_id AS job_owner_id,
         j.video_record_id AS job_video_record_id,
         j.video_asset_id AS job_video_asset_id, j.status AS job_status,
         j.progress AS job_progress, j.current_step AS job_current_step,
         j.retry_count AS job_retry_count, j.error_code AS job_error_code,
         j.error_message AS job_error_message, j.started_at AS job_started_at,
         j.completed_at AS job_completed_at, j.created_at AS job_created_at
       FROM video_matches m
       JOIN video_records r ON r.id=m.video_record_id
       JOIN video_assets a ON a.id=m.video_asset_id
       LEFT JOIN LATERAL (
         SELECT * FROM analysis_jobs candidate
         WHERE candidate.video_record_id=r.id
         ORDER BY candidate.created_at DESC LIMIT 1
       ) j ON true
       WHERE m.status='matched' AND r.owner_id=$1
       ORDER BY r.published_at DESC, r.spreadsheet_row ASC`,
      [ownerId],
    );
    return result.rows.map((row) => {
      const asset = videoAsset({
        id: row.asset_id,
        import_id: row.asset_import_id,
        original_filename: row.asset_original_filename,
        normalized_filename: row.asset_normalized_filename,
        storage_path: row.asset_storage_path,
        mime_type: row.asset_mime_type,
        file_size: row.asset_file_size,
        last_modified_at: row.asset_last_modified_at,
        duration_seconds: row.asset_duration_seconds,
        width: row.asset_width,
        height: row.asset_height,
        fps: row.asset_fps,
        processing_status: row.asset_processing_status,
      });
      const match = videoMatch({
        id: row.match_id,
        video_asset_id: row.asset_id,
        video_record_id: row.id,
        method: row.match_method,
        similarity_score: row.match_similarity_score,
        status: row.match_status,
        confirmed_by_user: row.match_confirmed_by_user,
        candidates_json: row.match_candidates_json,
      });
      return {
        record: videoRecord(row),
        asset,
        match,
        job: row.job_id ? analysisJob(row) : null,
      };
    });
  }

  async createAnalysisJobs(
    ownerId: string,
    videoRecordIds: string[],
  ): Promise<AnalysisJob[]> {
    const result = await this.pool.query(
      `INSERT INTO analysis_jobs
       (id,owner_id,video_record_id,video_asset_id,status,progress,current_step)
       SELECT gen_random_uuid(), $1, r.id, m.video_asset_id, 'queued', 0, 'queued'
       FROM video_records r
       JOIN video_matches m ON m.video_record_id=r.id AND m.status='matched'
       WHERE r.owner_id=$1 AND r.id=ANY($2::uuid[])
       ORDER BY r.published_at DESC, r.spreadsheet_row ASC
       RETURNING *`,
      [ownerId, videoRecordIds],
    );
    return result.rows.map(analysisJob);
  }

  async retryJob(ownerId: string, jobId: string): Promise<AnalysisJob | null> {
    const result = await this.pool.query(
      `UPDATE analysis_jobs
       SET status='queued', progress=0, current_step='queued',
           retry_count=retry_count+1, error_code=NULL, error_message=NULL,
           started_at=NULL, completed_at=NULL
       WHERE id=$1 AND owner_id=$2 RETURNING *`,
      [jobId, ownerId],
    );
    return result.rows[0] ? analysisJob(result.rows[0]) : null;
  }

  async getVideo(ownerId: string, videoId: string) {
    const recordResult = await this.pool.query(
      "SELECT * FROM video_records WHERE id=$1 AND owner_id=$2",
      [videoId, ownerId],
    );
    if (!recordResult.rows[0]) return null;
    const record = videoRecord(recordResult.rows[0]);
    const [matchResult, jobResult, baselineResult] = await Promise.all([
      this.pool.query(
        `SELECT m.*, a.*,
          m.id AS match_id, a.id AS asset_id
         FROM video_matches m JOIN video_assets a ON a.id=m.video_asset_id
         WHERE m.video_record_id=$1 ORDER BY m.updated_at DESC LIMIT 1`,
        [videoId],
      ),
      this.pool.query(
        `SELECT * FROM analysis_jobs WHERE video_record_id=$1
         ORDER BY created_at DESC LIMIT 1`,
        [videoId],
      ),
      this.pool.query(
        "SELECT * FROM video_records WHERE import_id=$1 ORDER BY spreadsheet_row",
        [record.importId],
      ),
    ]);
    const combined = matchResult.rows[0];
    const job = jobResult.rows[0] ? analysisJob(jobResult.rows[0]) : null;
    const resultQuery = job
      ? await this.pool.query(
          "SELECT * FROM analysis_results WHERE analysis_job_id=$1 ORDER BY created_at DESC LIMIT 1",
          [job.id],
        )
      : { rows: [] as DatabaseRow[] };
    const resultRow = resultQuery.rows[0];
    const result: AnalysisResultEntry | null = resultRow
      ? {
          id: String(resultRow.id),
          analysisJobId: String(resultRow.analysis_job_id),
          result: resultRow.result_json as DiagnosisResult,
          editedMarkdown: resultRow.edited_markdown
            ? String(resultRow.edited_markdown)
            : null,
          createdAt: new Date(String(resultRow.created_at)).toISOString(),
          updatedAt: new Date(String(resultRow.updated_at)).toISOString(),
        }
      : null;
    return {
      record,
      asset: combined ? videoAsset({ ...combined, id: combined.asset_id }) : null,
      match: combined
        ? videoMatch({
            ...combined,
            id: combined.match_id,
            video_asset_id: combined.asset_id,
          })
        : null,
      job,
      result,
      baseline: calculateAccountBaseline(baselineResult.rows.map(videoRecord)),
      analysisMode: "worker" as const,
    };
  }

  async saveEditedReport(
    ownerId: string,
    videoId: string,
    markdown: string,
  ): Promise<AnalysisResultEntry | null> {
    const result = await this.pool.query(
      `UPDATE analysis_results result
       SET edited_markdown=$1, updated_at=now()
       FROM analysis_jobs job
       WHERE result.analysis_job_id=job.id
         AND job.video_record_id=$2 AND job.owner_id=$3
       RETURNING result.*`,
      [markdown, videoId, ownerId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: String(row.id),
          analysisJobId: String(row.analysis_job_id),
          result: row.result_json as DiagnosisResult,
          editedMarkdown: row.edited_markdown
            ? String(row.edited_markdown)
            : null,
          createdAt: new Date(String(row.created_at)).toISOString(),
          updatedAt: new Date(String(row.updated_at)).toISOString(),
        }
      : null;
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
      )
    );
  }
}
