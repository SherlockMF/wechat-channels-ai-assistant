import path from "node:path";
import fs from "node:fs/promises";
import { createId } from "@/lib/id";
import { storageRoot } from "@/lib/storage/private-storage";

export type DraftReviewQueueStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface DraftReviewQueueJob {
  id: string;
  ownerId: string;
  draftReviewId: string;
  versionId: string;
  sourceScriptDraftId: string | null;
  status: DraftReviewQueueStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  workerId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface EnqueueDraftReviewJobInput {
  ownerId: string;
  draftReviewId: string;
  versionId: string;
  sourceScriptDraftId?: string | null;
  maxAttempts?: number;
}

export interface DraftReviewQueueRunner {
  (job: DraftReviewQueueJob): Promise<void>;
}

export interface DraftReviewProcessingContract {
  processDraftReview(
    ownerId: string,
    draftReviewId: string,
    versionId: string,
  ): Promise<
    | { status: "uploaded" | "processing" | "completed" | "failed"; errorMessage?: string | null }
    | null
  >;
}

export function createDraftReviewQueueRunner(
  repository: DraftReviewProcessingContract,
): DraftReviewQueueRunner {
  return async (job) => {
    const draft = await repository.processDraftReview(
      job.ownerId,
      job.draftReviewId,
      job.versionId,
    );
    if (!draft) throw new Error("审片记录或目标版本不存在");
    if (draft.status === "failed") {
      throw new Error(draft.errorMessage || "审片分析失败");
    }
    if (draft.status !== "completed") {
      throw new Error(`审片处理未完成（status=${draft.status}）`);
    }
  };
}

interface QueueFile {
  version: 1;
  jobs: DraftReviewQueueJob[];
}

interface QueueOptions {
  filePath?: string;
  now?: () => Date;
}

export function draftReviewQueuePath(): string {
  const configured = process.env.DRAFT_REVIEW_QUEUE_PATH?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(storageRoot(), "draft-review-analysis-queue.json");
}

function validateInput(input: EnqueueDraftReviewJobInput): void {
  if (!input.ownerId.trim() || !input.draftReviewId.trim() || !input.versionId.trim()) {
    throw new Error("审片队列任务缺少 ownerId/draftReviewId/versionId");
  }
}

function parseQueueFile(raw: string): QueueFile {
  const parsed = JSON.parse(raw) as Partial<QueueFile>;
  if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) {
    throw new Error("审片队列文件格式无效");
  }
  return { version: 1, jobs: parsed.jobs };
}

export class PersistentDraftReviewQueue {
  private readonly filePath: string;
  private readonly now: () => Date;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: QueueOptions = {}) {
    this.filePath = options.filePath ?? draftReviewQueuePath();
    this.now = options.now ?? (() => new Date());
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async read(): Promise<QueueFile> {
    try {
      return parseQueueFile(await fs.readFile(this.filePath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, jobs: [] };
      }
      throw error;
    }
  }

  private async write(file: QueueFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${createId()}.tmp`;
    try {
      await fs.writeFile(
        temporaryPath,
        `${JSON.stringify(file, null, 2)}\n`,
        "utf8",
      );
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async enqueue(input: EnqueueDraftReviewJobInput): Promise<DraftReviewQueueJob> {
    validateInput(input);
    return this.exclusive(async () => {
      const file = await this.read();
      const active = file.jobs.find(
        (job) =>
          job.ownerId === input.ownerId &&
          job.draftReviewId === input.draftReviewId &&
          job.versionId === input.versionId &&
          (job.status === "queued" || job.status === "processing"),
      );
      if (active) return active;
      const now = this.now().toISOString();
      const job: DraftReviewQueueJob = {
        id: createId(),
        ownerId: input.ownerId,
        draftReviewId: input.draftReviewId,
        versionId: input.versionId,
        sourceScriptDraftId: input.sourceScriptDraftId?.trim() || null,
        status: "queued",
        attempts: 0,
        maxAttempts: Math.max(1, Math.min(10, input.maxAttempts ?? 3)),
        availableAt: now,
        workerId: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
      };
      file.jobs.push(job);
      await this.write(file);
      return job;
    });
  }

  async claimNext(workerId: string): Promise<DraftReviewQueueJob | null> {
    if (!workerId.trim()) throw new Error("workerId 不能为空");
    return this.exclusive(async () => {
      const file = await this.read();
      const now = this.now();
      const job = file.jobs
        .filter(
          (item) =>
            item.status === "queued" &&
            new Date(item.availableAt).getTime() <= now.getTime(),
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
      if (!job) return null;
      job.status = "processing";
      job.workerId = workerId.trim();
      job.attempts += 1;
      job.startedAt = now.toISOString();
      job.updatedAt = now.toISOString();
      job.errorMessage = null;
      await this.write(file);
      return { ...job };
    });
  }

  async complete(jobId: string): Promise<DraftReviewQueueJob | null> {
    return this.exclusive(async () => {
      const file = await this.read();
      const job = file.jobs.find((item) => item.id === jobId);
      if (!job) return null;
      const now = this.now().toISOString();
      job.status = "completed";
      job.updatedAt = now;
      job.completedAt = now;
      job.errorMessage = null;
      await this.write(file);
      return { ...job };
    });
  }

  async fail(
    jobId: string,
    error: unknown,
    retryDelayMs = 5_000,
  ): Promise<DraftReviewQueueJob | null> {
    return this.exclusive(async () => {
      const file = await this.read();
      const job = file.jobs.find((item) => item.id === jobId);
      if (!job) return null;
      const now = this.now();
      const retry = job.attempts < job.maxAttempts;
      job.status = retry ? "queued" : "failed";
      job.availableAt = new Date(now.getTime() + Math.max(0, retryDelayMs)).toISOString();
      job.workerId = null;
      job.updatedAt = now.toISOString();
      job.completedAt = retry ? null : now.toISOString();
      job.errorMessage =
        (error instanceof Error ? error.message : String(error)).slice(0, 2_000) ||
        "审片任务失败";
      await this.write(file);
      return { ...job };
    });
  }

  async recoverStale(staleAfterMs = 15 * 60_000): Promise<number> {
    return this.exclusive(async () => {
      const file = await this.read();
      const now = this.now();
      let recovered = 0;
      for (const job of file.jobs) {
        if (
          job.status !== "processing" ||
          !job.startedAt ||
          now.getTime() - new Date(job.startedAt).getTime() < staleAfterMs
        ) {
          continue;
        }
        const retry = job.attempts < job.maxAttempts;
        job.status = retry ? "queued" : "failed";
        job.availableAt = now.toISOString();
        job.workerId = null;
        job.updatedAt = now.toISOString();
        job.completedAt = retry ? null : now.toISOString();
        job.errorMessage = "Worker 超时，任务已恢复";
        recovered += 1;
      }
      if (recovered > 0) await this.write(file);
      return recovered;
    });
  }

  async list(params: {
    ownerId?: string;
    draftReviewId?: string;
    status?: DraftReviewQueueStatus;
  } = {}): Promise<DraftReviewQueueJob[]> {
    return this.exclusive(async () => {
      const file = await this.read();
      return file.jobs
        .filter(
          (job) =>
            (!params.ownerId || job.ownerId === params.ownerId) &&
            (!params.draftReviewId || job.draftReviewId === params.draftReviewId) &&
            (!params.status || job.status === params.status),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((job) => ({ ...job }));
    });
  }

  /** Claim → invoke repository-independent runner → complete/retry. */
  async runNext(
    workerId: string,
    runner: DraftReviewQueueRunner,
  ): Promise<DraftReviewQueueJob | null> {
    const job = await this.claimNext(workerId);
    if (!job) return null;
    try {
      await runner(job);
      return await this.complete(job.id);
    } catch (error) {
      await this.fail(job.id, error);
      throw error;
    }
  }
}

export const draftReviewQueue = new PersistentDraftReviewQueue();
