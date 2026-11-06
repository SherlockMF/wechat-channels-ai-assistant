import { researchSnapshotDatabase, readCloudResearchSnapshot, latestCloudResearchSnapshotId, writeCloudResearchSnapshot } from "@/lib/data/research-snapshot-store";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  hotspotSnapshotSchema,
  type HotspotSnapshot,
} from "@video-diagnosis/shared-types";
import { normalizeOwnerId } from "@/lib/data/owner";
import {
  HOTSPOT_REFRESH_INTERVAL_MS,
  HOTSPOT_SNAPSHOT_RETENTION,
  type HotspotRuntimeConfig,
} from "@/lib/hotspots/types";

const snapshotIdPattern = /^hs-[a-f0-9]{16}-[a-f0-9]{24}$/u;
const indexLocks = new Map<string, Promise<void>>();
/** 抓取与聚类口径变化时旧快照不该被复用。 */
const HOTSPOT_POLICY_VERSION = 5;

interface CacheIndex {
  version: 1;
  entries: Record<string, { snapshotId: string; updatedAt: string }>;
  history: Array<{ snapshotId: string; fetchedAt: string }>;
}

export function hotspotStorageRoot(override?: string): string {
  const configured = override?.trim() || process.env.HOTSPOT_STORAGE_ROOT?.trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), ".data", "hotspots");
}

/** 所有会影响抓取、聚类或选题结果的字段都必须进入 key。 */
export function hotspotConfigKey(config: HotspotRuntimeConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        policyVersion: HOTSPOT_POLICY_VERSION,
        rsshubBaseUrl: config.rsshubBaseUrl.trim(),
        freshnessDays: config.freshnessDays,
        maxItemsPerSource: config.maxItemsPerSource,
        trackIds: [...config.trackIds].sort(),
        customKeywords: config.customKeywords
          .map((keyword) => keyword.toLocaleLowerCase())
          .sort((left, right) => left.localeCompare(right)),
        accountPositioning: config.accountPositioning,
        llm: {
          enabled: config.llm.enabled,
          model: config.llm.model.trim(),
        },
        sources: config.sources
          .map((source) => ({
            id: source.id,
            name: source.name,
            url: source.url,
            kind: source.kind,
            enabled: source.enabled,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      }),
    )
    .digest("hex");
}

/** ID 不可变：刷新写新快照，历史引用永远有效。 */
export function createHotspotSnapshotId(
  configKey: string,
  fetchedAt: string,
  entropy: string = randomUUID(),
): string {
  const suffix = createHash("sha256")
    .update(`${configKey}:${fetchedAt}:${entropy}`)
    .digest("hex")
    .slice(0, 24);
  return `hs-${configKey.slice(0, 16)}-${suffix}`;
}

function ownerDirectory(ownerId: string, rootOverride?: string): string {
  return path.join(
    hotspotStorageRoot(rootOverride),
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
  return { version: 1, entries: {}, history: [] };
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
      const index = parsed as CacheIndex;
      return { ...index, history: Array.isArray(index.history) ? index.history : [] };
    }
  } catch {
    // 索引缺失或损坏等同于空缓存。
  }
  return emptyIndex();
}

async function replaceJsonFile(filePath: string, value: unknown): Promise<void> {
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

export function isHotspotSnapshotExpired(
  snapshot: HotspotSnapshot,
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(snapshot.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

export function isHotspotRefreshDue(snapshot: HotspotSnapshot, now = new Date()): boolean {
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  return !Number.isFinite(fetchedAt) || isHotspotSnapshotExpired(snapshot, now)
    || now.getTime() - fetchedAt >= HOTSPOT_REFRESH_INTERVAL_MS;
}

export async function readHotspotSnapshot(
  ownerId: string,
  snapshotId: string,
  options: { storageRoot?: string } = {},
): Promise<HotspotSnapshot | null> {
  const owner = normalizeOwnerId(ownerId);
  const filePath = ownerSnapshotPath(owner, snapshotId, options.storageRoot);
  if (!filePath) return null;
  const db = researchSnapshotDatabase();
  if (db) {
    const raw = await readCloudResearchSnapshot(db, "hotspots", owner, snapshotId);
    if (raw === null) return null;
    const parsed = hotspotSnapshotSchema.parse(raw);
    return parsed.ownerId === owner ? parsed : null;
  }
  try {
    const parsed = hotspotSnapshotSchema.parse(
      JSON.parse(await readFile(filePath, "utf8")) as unknown,
    );
    return parsed.ownerId === owner ? parsed : null;
  } catch {
    return null;
  }
}

export async function readLatestHotspotSnapshot(
  ownerId: string,
  configKey: string,
  options: { storageRoot?: string } = {},
): Promise<HotspotSnapshot | null> {
  const owner = normalizeOwnerId(ownerId);
  const db = researchSnapshotDatabase();
  if (db) {
    const id = await latestCloudResearchSnapshotId(db, "hotspots", owner, configKey);
    return id ? readHotspotSnapshot(owner, id, options) : null;
  }
  const indexPath = path.join(
    ownerDirectory(owner, options.storageRoot),
    "cache-index.json",
  );
  const entry = await withIndexLock(indexPath, async () => {
    const index = await readIndex(indexPath);
    return index.entries[configKey];
  });
  return entry ? readHotspotSnapshot(owner, entry.snapshotId, options) : null;
}

/** 保留最近 N 个快照；清理失败不影响主流程。 */
async function pruneOwnerSnapshots(
  directory: string,
  index: CacheIndex,
  keep: number,
): Promise<void> {
  const seen = new Set<string>();
  const ordered = index.history
    .filter((entry) => {
      if (!entry?.snapshotId || seen.has(entry.snapshotId)) return false;
      seen.add(entry.snapshotId);
      return true;
    })
    .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt));
  const retained = ordered.slice(0, keep);
  const removed = ordered.slice(keep);
  index.history = retained;
  const retainedIds = new Set(retained.map((entry) => entry.snapshotId));
  for (const key of Object.keys(index.entries)) {
    const entry = index.entries[key];
    if (entry && !retainedIds.has(entry.snapshotId)) delete index.entries[key];
  }
  for (const entry of removed) {
    await rm(path.join(directory, `${entry.snapshotId}.json`), {
      force: true,
    }).catch(() => {});
  }
}

export async function writeHotspotSnapshot(
  snapshot: HotspotSnapshot,
  options: {
    storageRoot?: string;
    configKey?: string;
    retention?: number;
  } = {},
): Promise<HotspotSnapshot> {
  const parsed = hotspotSnapshotSchema.parse(snapshot);
  const owner = normalizeOwnerId(parsed.ownerId);
  if (owner !== parsed.ownerId) throw new Error("热点快照 ownerId 未规范化");
  const filePath = ownerSnapshotPath(owner, parsed.id, options.storageRoot);
  if (!filePath) throw new Error("热点快照 ID 无效");
  const db = researchSnapshotDatabase();
  if (db) {
    await writeCloudResearchSnapshot(db, "hotspots", parsed, options.configKey, options.retention ?? HOTSPOT_SNAPSHOT_RETENTION);
    return parsed;
  }
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
    const existing = await readHotspotSnapshot(owner, parsed.id, options);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(parsed)) {
      throw new Error("热点快照 ID 冲突");
    }
  }

  const directory = path.dirname(filePath);
  const indexPath = path.join(directory, "cache-index.json");
  await withIndexLock(indexPath, async () => {
    const index = await readIndex(indexPath);
    if (options.configKey) {
      index.entries[options.configKey] = {
        snapshotId: parsed.id,
        updatedAt: parsed.fetchedAt,
      };
    }
    index.history.push({ snapshotId: parsed.id, fetchedAt: parsed.fetchedAt });
    await pruneOwnerSnapshots(
      directory,
      index,
      Math.max(1, options.retention ?? HOTSPOT_SNAPSHOT_RETENTION),
    );
    await replaceJsonFile(indexPath, index);
  });
  return parsed;
}
