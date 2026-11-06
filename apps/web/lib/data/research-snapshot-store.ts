import { normalizeOwnerId } from "./owner";

interface Statement {
  bind(...values: unknown[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface Database { prepare(sql: string): Statement }
type Kind = "hotspots" | "viral";
const schemas = new WeakMap<Database, Promise<void>>();

export function researchSnapshotDatabase(): Database | undefined {
  return (globalThis as typeof globalThis & { __SITES_ENV__?: { DB?: Database } }).__SITES_ENV__?.DB;
}

async function ensureSchema(db: Database) {
  let pending = schemas.get(db);
  if (!pending) {
    pending = db.prepare(`CREATE TABLE IF NOT EXISTS research_snapshots (
      owner_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
      cache_key TEXT, fetched_at TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (owner_id, kind, id)
    )`).run().then(() => undefined).catch(error => { schemas.delete(db); throw error; });
    schemas.set(db, pending);
  }
  await pending;
}

export async function readCloudResearchSnapshot(db: Database, kind: Kind, ownerId: string, id: string): Promise<unknown | null> {
  await ensureSchema(db);
  const { results } = await db.prepare("SELECT payload FROM research_snapshots WHERE owner_id = ? AND kind = ? AND id = ?")
    .bind(normalizeOwnerId(ownerId), kind, id).all<{ payload: string }>();
  if (!results[0]) return null;
  try { return JSON.parse(results[0].payload); }
  catch { throw new Error("云端研究快照无法读取，请重新抓取来源。"); }
}

export async function latestCloudResearchSnapshotId(db: Database, kind: Kind, ownerId: string, cacheKey: string): Promise<string | null> {
  await ensureSchema(db);
  const { results } = await db.prepare("SELECT id FROM research_snapshots WHERE owner_id = ? AND kind = ? AND cache_key = ? ORDER BY fetched_at DESC, id DESC LIMIT 1")
    .bind(normalizeOwnerId(ownerId), kind, cacheKey).all<{ id: string }>();
  return results[0]?.id ?? null;
}

export async function writeCloudResearchSnapshot(
  db: Database, kind: Kind, snapshot: { ownerId: string; id: string; fetchedAt: string }, cacheKey: string | undefined, retention: number,
) {
  await ensureSchema(db);
  const payload = JSON.stringify(snapshot);
  if (new TextEncoder().encode(payload).byteLength > 1_800_000) throw new Error("研究快照超过云端存储上限，请减少来源数量。");
  await db.prepare("INSERT INTO research_snapshots (owner_id, kind, id, cache_key, fetched_at, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, kind, id) DO NOTHING")
    .bind(snapshot.ownerId, kind, snapshot.id, cacheKey ?? null, snapshot.fetchedAt, payload).run();
  const existing = await readCloudResearchSnapshot(db, kind, snapshot.ownerId, snapshot.id);
  if (JSON.stringify(existing) !== payload) throw new Error("研究快照 ID 冲突，未覆盖原记录。");
  // 与本地一样只清理本 owner 的旧快照，保留最新快照及有限历史。
  await db.prepare("DELETE FROM research_snapshots WHERE owner_id = ? AND kind = ? AND id NOT IN (SELECT id FROM research_snapshots WHERE owner_id = ? AND kind = ? ORDER BY fetched_at DESC, id DESC LIMIT ?)")
    .bind(snapshot.ownerId, kind, snapshot.ownerId, kind, Math.max(1, retention)).run();
}
