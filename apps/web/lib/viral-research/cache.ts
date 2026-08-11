import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  viralResearchSnapshotSchema,
  type ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import { normalizeOwnerId } from "@/lib/data/owner";
import type { ViralResearchQuery } from "@/lib/viral-research/types";

const snapshotIdPattern = /^vr-[a-f0-9]{16}-[a-f0-9]{24}$/u;
const indexLocks = new Map<string, Promise<void>>();
const RESEARCH_POLICY_VERSION = 3;

interface CacheIndex {
  version: 1;
  entries: Record<string, { snapshotId: string; updatedAt: string }>;
}

export function viralResearchStorageRoot(override?: string): string {
  const configured =
    override?.trim() || process.env.VIRAL_RESEARCH_STORAGE_ROOT?.trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), ".data", "viral-research");
}

function normalizedQuery(query: ViralResearchQuery) {
  return {
    topic: query.topic.trim(),
    format: query.format?.trim() || undefined,
    audience: query.audience?.trim() || undefined,
    contentGoal: query.contentGoal?.trim() || undefined,
    region: query.region?.trim() || undefined,
  };
}

export function viralResearchQueryKey(query: ViralResearchQuery): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        policyVersion: RESEARCH_POLICY_VERSION,
        query: normalizedQuery(query),
      }),
    )
    .digest("hex");
}

/** IDs are immutable: refreshes create a new snapshot instead of moving old references. */
export function createViralResearchSnapshotId(
  query: ViralResearchQuery,
  fetchedAt: string,
  entropy: string = randomUUID(),
): string {
  const queryKey = viralResearchQueryKey(query);
  const suffix = createHash("sha256")
    .update(`${queryKey}:${fetchedAt}:${entropy}`)
    .digest("hex")
    .slice(0, 24);
  return `vr-${queryKey.slice(0, 16)}-${suffix}`;
}

function ownerDirectory(ownerId: string, rootOverride?: string): string {
  return path.join(
    viralResearchStorageRoot(rootOverride),
    "owners",
    normalizeOwnerId(ownerId),
  );
}

function ownerSnapshotPath(
  ownerId: string,
  snapshotId: string,
  rootOverride?: string,
): string | undefined {
  if (!snapshotIdPattern.test(snapshotId)) return undefined;
  return path.join(ownerDirectory(ownerId, rootOverride), `${snapshotId}.json`);
}

function emptyIndex(): CacheIndex {
  return { version: 1, entries: {} };
}

async function withIndexLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = indexLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  indexLocks.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (indexLocks.get(key) === queued) indexLocks.delete(key);
  }
}

async function readIndex(indexPath: string): Promise<CacheIndex> {
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { version?: unknown }).version === 1 &&
      (parsed as { entries?: unknown }).entries &&
      typeof (parsed as { entries?: unknown }).entries === "object"
    ) {
      return parsed as CacheIndex;
    }
  } catch {
    // A missing or invalid index is equivalent to an empty cache.
  }
  return emptyIndex();
}

async function replaceJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    const backupPath = `${filePath}.${randomUUID()}.bak`;
    try {
      await rename(filePath, backupPath);
      await rename(temporaryPath, filePath);
      await rm(backupPath, { force: true });
    } catch {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

export function isViralResearchSnapshotExpired(
  snapshot: ViralResearchSnapshot,
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(snapshot.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

/** Stable owner-scoped read used by script/review integration and GET /[id]. */
export async function readViralResearchSnapshot(
  ownerId: string,
  snapshotId: string,
  options: { storageRoot?: string } = {},
): Promise<ViralResearchSnapshot | null> {
  const owner = normalizeOwnerId(ownerId);
  const filePath = ownerSnapshotPath(owner, snapshotId, options.storageRoot);
  if (!filePath) return null;
  try {
    const parsed = viralResearchSnapshotSchema.parse(
      JSON.parse(await readFile(filePath, "utf8")) as unknown,
    );
    return parsed.ownerId === owner ? parsed : null;
  } catch {
    return null;
  }
}

export async function readCachedViralResearchSnapshot(
  ownerId: string,
  query: ViralResearchQuery,
  options: { storageRoot?: string } = {},
): Promise<ViralResearchSnapshot | null> {
  const owner = normalizeOwnerId(ownerId);
  const directory = ownerDirectory(owner, options.storageRoot);
  const indexPath = path.join(directory, "cache-index.json");
  const queryKey = viralResearchQueryKey(query);
  return withIndexLock(indexPath, async () => {
    const index = await readIndex(indexPath);
    const entry = index.entries[queryKey];
    return entry
      ? readViralResearchSnapshot(owner, entry.snapshotId, options)
      : null;
  });
}

export async function writeViralResearchSnapshot(
  snapshot: ViralResearchSnapshot,
  options: {
    storageRoot?: string;
    cacheQuery?: ViralResearchQuery;
  } = {},
): Promise<ViralResearchSnapshot> {
  const parsed = viralResearchSnapshotSchema.parse(snapshot);
  const owner = normalizeOwnerId(parsed.ownerId);
  if (owner !== parsed.ownerId) {
    throw new Error("研究快照 ownerId 未规范化");
  }
  const filePath = ownerSnapshotPath(owner, parsed.id, options.storageRoot);
  if (!filePath) throw new Error("研究快照 ID 无效");
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
    const existing = await readViralResearchSnapshot(owner, parsed.id, options);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(parsed)) {
      throw new Error("研究快照 ID 冲突");
    }
  }

  if (options.cacheQuery) {
    const indexPath = path.join(path.dirname(filePath), "cache-index.json");
    const queryKey = viralResearchQueryKey(options.cacheQuery);
    await withIndexLock(indexPath, async () => {
      const index = await readIndex(indexPath);
      index.entries[queryKey] = {
        snapshotId: parsed.id,
        updatedAt: parsed.fetchedAt,
      };
      await replaceJsonFile(indexPath, index);
    });
  }
  return parsed;
}
