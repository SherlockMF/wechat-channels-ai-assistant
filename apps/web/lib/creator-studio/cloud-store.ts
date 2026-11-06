import { normalizeOwnerId } from "@/lib/data/owner";
import { emptyStudioState, studioStateSchema, StudioError, type StudioState } from "./types";

interface Statement {
  bind(...values: unknown[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface CreatorStudioDatabase { prepare(sql: string): Statement }
interface StudioRow { payload: string; revision: number }
const schemas = new WeakMap<CreatorStudioDatabase, Promise<void>>();

export function creatorStudioDatabase(): CreatorStudioDatabase | undefined {
  return (globalThis as typeof globalThis & { __SITES_ENV__?: { DB?: CreatorStudioDatabase } }).__SITES_ENV__?.DB;
}

async function ensureSchema(db: CreatorStudioDatabase): Promise<void> {
  let pending = schemas.get(db);
  if (!pending) {
    pending = db.prepare(`CREATE TABLE IF NOT EXISTS creator_studio (
      owner_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL
    )`).run().then(() => undefined).catch((error) => { schemas.delete(db); throw error; });
    schemas.set(db, pending);
  }
  await pending;
}

async function readRow(db: CreatorStudioDatabase, ownerId: string): Promise<{ state: StudioState; revision: number | null }> {
  await ensureSchema(db);
  const rows = await db.prepare("SELECT payload, revision FROM creator_studio WHERE owner_id = ?").bind(normalizeOwnerId(ownerId)).all<StudioRow>();
  const row = rows.results[0];
  if (!row) return { state: emptyStudioState(), revision: null };
  try {
    if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error("Invalid revision");
    return { state: studioStateSchema.parse(JSON.parse(row.payload)), revision: row.revision };
  } catch { throw new StudioError("云端创作资料无法读取，请保留现有记录并检查备份；未覆盖已有数据。", 500); }
}

export async function loadCloudStudio(db: CreatorStudioDatabase, ownerId: string): Promise<StudioState> {
  return (await readRow(db, ownerId)).state;
}

export async function updateCloudStudio(db: CreatorStudioDatabase, ownerId: string, update: (state: StudioState) => StudioState): Promise<StudioState> {
  const owner = normalizeOwnerId(ownerId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readRow(db, owner);
    const next = studioStateSchema.parse(update(current.state));
    const payload = JSON.stringify(next);
    if (new TextEncoder().encode(payload).byteLength > 1_800_000) throw new StudioError("云端创作资料已接近存储上限，请精简不再使用的素材。", 413);
    const result = current.revision === null
      ? await db.prepare("INSERT INTO creator_studio (owner_id, revision, payload) VALUES (?, 1, ?) ON CONFLICT(owner_id) DO NOTHING").bind(owner, payload).run()
      : await db.prepare("UPDATE creator_studio SET payload = ?, revision = revision + 1 WHERE owner_id = ? AND revision = ?").bind(payload, owner, current.revision).run();
    if (result.meta?.changes === 1) return next;
    if (result.meta?.changes !== 0) throw new StudioError("云端未确认资料写入，请重新读取后检查结果。", 500);
  }
  throw new StudioError("创作资料正在被其他请求修改，请重新读取后再保存。", 409);
}
