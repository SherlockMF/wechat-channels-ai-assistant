import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  viralResearchSnapshotSchema,
  type ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import { normalizeOwnerId } from "@/lib/data/owner";
import {
  VIRAL_RESEARCH_SNAPSHOT_RETENTION,
  type ViralResearchQuery,
} from "@/lib/viral-research/types";

const snapshotIdPattern = /^vr-[a-f0-9]{16}-[a-f0-9]{24}$/u;
const indexLocks = new Map<string, Promise<void>>();
/** 检索策略、证据分级或缓存维度变化时递增，旧缓存自然失效。 */
const RESEARCH_POLICY_VERSION = 4;

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

/** model 参与缓存维度：同主题换模型不复用旧结果。 */
export function viralResearchQueryKey(
  query: ViralResearchQuery,
  model: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        policyVersion: RESEARCH_POLICY_VERSION,
        model: model.trim().toLowerCase(),
        query: normalizedQuery(query),
      }),
    )
    .digest("hex");
}

/** IDs are immutable: refreshes create a new snapshot instead of moving old references. */
export function createViralResearchSnapshotId(
  query: ViralResearchQuery,
  model: string,
  fetchedAt: string,
  entropy: string = randomUUID(),
): string {
  const queryKey = viralResearchQueryKey(query, model);
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
  options: { storageRoot?: string; model: string },
): Promise<ViralResearchSnapshot | null> {
  const owner = normalizeOwnerId(ownerId);
  const directory = ownerDirectory(owner, options.storageRoot);
  const indexPath = path.join(directory, "cache-index.json");
  const queryKey = viralResearchQueryKey(query, options.model);
  return withIndexLock(indexPath, async () => {
    const index = await readIndex(indexPath);
    const entry = index.entries[queryKey];
    return entry
      ? readViralResearchSnapshot(owner, entry.snapshotId, options)
      : null;
  });
}

/**
 * owner 目录只保留最近若干个快照；清理是尽力而为，失败不能影响写入结果。
 * 仍被缓存索引引用的快照永远保留。
 */
async function pruneOwnerSnapshots(
  directory: string,
  indexPath: string,
  keep = VIRAL_RESEARCH_SNAPSHOT_RETENTION,
): Promise<void> {
  try {
    const referenced = new Set(
      Object.values((await readIndex(indexPath)).entries).map(
        (entry) => entry.snapshotId,
      ),
    );
    const names = (await readdir(directory)).filter(
      (name) =>
        name.endsWith(".json") &&
        snapshotIdPattern.test(name.slice(0, -".json".length)) &&
        !referenced.has(name.slice(0, -".json".length)),
    );
    if (names.length <= keep) return;
    const dated = await Promise.all(
      names.map(async (name) => {
        const filePath = path.join(directory, name);
        try {
          return { filePath, modifiedAt: (await stat(filePath)).mtimeMs };
        } catch {
          return { filePath, modifiedAt: 0 };
        }
      }),
    );
    const expired = dated
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
      .slice(keep);
    await Promise.all(
      expired.map(({ filePath }) => rm(filePath, { force: true })),
    );
  } catch {
    // 快照清理失败不影响主流程。
  }
}

export async function writeViralResearchSnapshot(
  snapshot: ViralResearchSnapshot,
  options: {
    storageRoot?: string;
    cacheQuery?: ViralResearchQuery;
    cacheModel?: string;
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

  const directory = path.dirname(filePath);
  const indexPath = path.join(directory, "cache-index.json");
  if (options.cacheQuery && options.cacheModel) {
    const queryKey = viralResearchQueryKey(
      options.cacheQuery,
      options.cacheModel,
    );
    await withIndexLock(indexPath, async () => {
      const index = await readIndex(indexPath);
      index.entries[queryKey] = {
        snapshotId: parsed.id,
        updatedAt: parsed.fetchedAt,
      };
      await replaceJsonFile(indexPath, index);
    });
  }
  await pruneOwnerSnapshots(directory, indexPath);
  return parsed;
}
