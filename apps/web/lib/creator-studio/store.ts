import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeOwnerId } from "@/lib/data/owner";
import { emptyStudioState, studioStateSchema, StudioError, type StudioState } from "./types";
import { creatorStudioDatabase, loadCloudStudio, updateCloudStudio } from "./cloud-store";

const locks = new Map<string, Promise<void>>();

export function studioFilePath(ownerId: string): string {
  const root = process.env.CREATOR_STUDIO_STORAGE_ROOT?.trim();
  // Windows 文件名不区分大小写，直接用 owner 会把 Alice 和 alice 混在一起。
  const ownerKey = createHash("sha256").update(normalizeOwnerId(ownerId)).digest("hex");
  return path.join(root ? path.resolve(root) : path.resolve(process.cwd(), ".data", "creator-studio"), `${ownerKey}.json`);
}

export async function loadStudio(ownerId: string): Promise<StudioState> {
  const db = creatorStudioDatabase();
  if (db) return loadCloudStudio(db, ownerId);
  try {
    return studioStateSchema.parse(JSON.parse(await readFile(studioFilePath(ownerId), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStudioState();
    throw new StudioError("创作资料文件无法读取，请保留原文件并检查备份；未覆盖现有数据。", 500);
  }
}

/** 同一进程按文件串行写；先校验完整状态，再原子替换，避免并发编辑丢失资料。 */
export async function updateStudio(
  ownerId: string,
  update: (state: StudioState) => StudioState,
): Promise<StudioState> {
  const file = studioFilePath(ownerId);
  const db = creatorStudioDatabase();
  const previous = locks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(file, queued);
  await previous;
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    if (db) return await updateCloudStudio(db, ownerId, update);
    const next = studioStateSchema.parse(update(await loadStudio(ownerId)));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
    return next;
  } finally {
    if (!db) await rm(temporary, { force: true }).catch(() => undefined);
    release();
    if (locks.get(file) === queued) locks.delete(file);
  }
}
