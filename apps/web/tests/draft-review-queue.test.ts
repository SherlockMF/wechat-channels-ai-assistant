import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDraftReviewQueueRunner,
  PersistentDraftReviewQueue,
} from "@/lib/draft-review/queue";

describe("PersistentDraftReviewQueue", () => {
  let directory = "";
  let now = Date.parse("2026-08-10T00:00:00.000Z");
  let queue: PersistentDraftReviewQueue;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "draft-review-queue-"));
    now = Date.parse("2026-08-10T00:00:00.000Z");
    queue = new PersistentDraftReviewQueue({
      filePath: path.join(directory, "queue.json"),
      now: () => new Date(now),
    });
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("同一版本的活跃任务幂等入队并可持久化完成", async () => {
    const input = {
      ownerId: "owner-1",
      draftReviewId: "draft-1",
      versionId: "version-1",
      sourceScriptDraftId: "script-1",
    };
    const first = await queue.enqueue(input);
    const duplicate = await queue.enqueue(input);
    expect(duplicate.id).toBe(first.id);

    const claimed = await queue.claimNext("worker-1");
    expect(claimed).toMatchObject({ status: "processing", attempts: 1 });
    await queue.complete(first.id);

    const reloaded = new PersistentDraftReviewQueue({
      filePath: path.join(directory, "queue.json"),
    });
    expect(await reloaded.list()).toEqual([
      expect.objectContaining({ id: first.id, status: "completed" }),
    ]);
  });

  it("失败按最大尝试次数重试，最终进入 failed", async () => {
    const job = await queue.enqueue({
      ownerId: "owner-1",
      draftReviewId: "draft-1",
      versionId: "version-1",
      maxAttempts: 2,
    });
    await queue.claimNext("worker-1");
    expect((await queue.fail(job.id, new Error("first"), 0))?.status).toBe("queued");
    now += 1;
    await queue.claimNext("worker-2");
    const failed = await queue.fail(job.id, new Error("second"), 0);
    expect(failed).toMatchObject({ status: "failed", attempts: 2 });
  });

  it("仓储吞掉异常但返回 failed 时仍触发队列重试", async () => {
    const job = await queue.enqueue({
      ownerId: "owner-1",
      draftReviewId: "draft-1",
      versionId: "version-1",
    });
    const runner = createDraftReviewQueueRunner({
      async processDraftReview() {
        return { status: "failed" as const, errorMessage: "provider failed" };
      },
    });
    await expect(queue.runNext("worker-1", runner)).rejects.toThrow(
      "provider failed",
    );
    expect((await queue.list()).find((item) => item.id === job.id)?.status).toBe(
      "queued",
    );
  });
});
