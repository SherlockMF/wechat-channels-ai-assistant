import { repository } from "@/lib/data/repository";
import {
  draftReviewQueue,
  type DraftReviewQueueJob,
  type EnqueueDraftReviewJobInput,
} from "@/lib/draft-review/queue";

const STALE_AFTER_MS = 15 * 60_000;
const WORKER_ID = `local-draft-review-${process.pid}`;

let drainPromise: Promise<void> | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let rerunRequested = false;

export function usesPersistentDraftReviewQueue(): boolean {
  return process.env.SITES_DEPLOYMENT !== "true";
}

async function analyzeJob(job: DraftReviewQueueJob): Promise<void> {
  await repository.processDraftReview(
    job.ownerId,
    job.draftReviewId,
    job.versionId,
  );
  const payload = await repository.getDraftReview(
    job.ownerId,
    job.draftReviewId,
    { versionId: job.versionId },
  );
  // 用户可能在排队期间删除审片；此时任务可安全结束，无需重试。
  if (!payload) return;
  if (payload.draft.status === "failed") {
    throw new Error(payload.draft.errorMessage || "审片分析失败");
  }
  if (payload.draft.status !== "completed") {
    throw new Error(`审片分析未完成（${payload.draft.status}）`);
  }
}

function scheduleDrain(delayMs = 0): void {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    void startDraftReviewQueueDrain();
  }, Math.max(0, delayMs));
}

async function nextWakeDelay(): Promise<number | null> {
  const now = Date.now();
  const queued = await draftReviewQueue.list({ status: "queued" });
  const processing = await draftReviewQueue.list({ status: "processing" });
  const candidates = [
    ...queued.map((job) => Math.max(0, Date.parse(job.availableAt) - now)),
    ...processing.map((job) =>
      job.startedAt
        ? Math.max(0, Date.parse(job.startedAt) + STALE_AFTER_MS - now)
        : 0,
    ),
  ].filter(Number.isFinite);
  return candidates.length ? Math.min(...candidates) : null;
}

async function drain(): Promise<void> {
  await draftReviewQueue.recoverStale(STALE_AFTER_MS);
  for (;;) {
    try {
      const completed = await draftReviewQueue.runNext(WORKER_ID, analyzeJob);
      if (!completed) break;
    } catch {
      // runNext 已持久化失败/重试状态；继续处理其他可用任务。
    }
  }
  const delay = await nextWakeDelay();
  if (delay !== null) scheduleDrain(Math.max(250, delay));
}

export function startDraftReviewQueueDrain(): Promise<void> {
  if (drainPromise) return drainPromise;
  rerunRequested = false;
  drainPromise = drain().finally(() => {
    drainPromise = null;
    if (rerunRequested) scheduleDrain(0);
  });
  return drainPromise;
}

export async function enqueueDraftReviewAnalysis(
  input: EnqueueDraftReviewJobInput,
): Promise<void> {
  await draftReviewQueue.enqueue(input);
  rerunRequested = true;
  void startDraftReviewQueueDrain();
}
