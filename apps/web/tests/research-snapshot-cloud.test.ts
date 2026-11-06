import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hotspotSnapshotSchema, viralResearchSnapshotSchema } from "@video-diagnosis/shared-types";
import { createHotspotSnapshotId, readHotspotSnapshot, readLatestHotspotSnapshot, writeHotspotSnapshot } from "@/lib/hotspots/cache";
import { readCachedViralResearchSnapshot, writeViralResearchSnapshot } from "@/lib/viral-research/cache";
import { resolveScriptResearchContext } from "@/lib/script-workbench/research-context";

function adapter(database: DatabaseSync) {
  return { prepare(sql: string) {
    let values: SQLInputValue[] = [];
    const statement = {
      bind(...input: SQLInputValue[]) { values = input; return statement; },
      async all<T>() { return { results: database.prepare(sql).all(...values) as T[] }; },
      async run() { return database.prepare(sql).run(...values); },
    };
    return statement;
  } };
}
const runtime = globalThis as typeof globalThis & { __SITES_ENV__?: { DB?: ReturnType<typeof adapter> } };
const previous = runtime.__SITES_ENV__;
let db: DatabaseSync;
let root: string;
beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  root = await mkdtemp(path.join(os.tmpdir(), "research-cloud-"));
  runtime.__SITES_ENV__ = { DB: adapter(db) };
});
afterEach(async () => { runtime.__SITES_ENV__ = previous; db.close(); await rm(root, { recursive: true, force: true }); });

function hotspot(index = 0) {
  const fetchedAt = new Date(Date.UTC(2098, 0, 1, index)).toISOString();
  return hotspotSnapshotSchema.parse({
    id: createHotspotSnapshotId("a".repeat(64), fetchedAt, String(index)), ownerId: "alice", fetchedAt, expiresAt: "2099-01-01T00:00:00.000Z",
    items: [{ id: "item", sourceId: "feed", sourceName: "真实源", title: "净水设备记录", url: "https://example.com/source" }],
    clusters: [{ id: "cluster", headline: "净水设备", itemIds: ["item"], sourceCount: 1, firstSeenAt: fetchedAt, latestAt: fetchedAt, heat: 6 }],
    topicCards: [],
  });
}
describe("Sites 研究快照与脚本来源", () => {
  it("热点写入 D1，重建绑定后仍能读取并进入脚本上下文，不写本地文件", async () => {
    const snapshot = hotspot();
    await writeHotspotSnapshot(snapshot, { storageRoot: root, configKey: "config" });
    runtime.__SITES_ENV__ = { DB: adapter(db) };
    expect((await readLatestHotspotSnapshot("alice", "config"))?.id).toBe(snapshot.id);
    const context = await resolveScriptResearchContext("alice", { idea: "净水", hotspotSnapshotId: snapshot.id, hotspotClusterId: "cluster" });
    expect(context.hotspotItems[0]?.url).toBe("https://example.com/source");
    expect(await readHotspotSnapshot("bob", snapshot.id)).toBeNull();
    expect(await readdir(root)).toEqual([]);
    await expect(writeHotspotSnapshot({ ...snapshot, limitations: ["覆盖"] })).rejects.toThrow("冲突");
    expect((await readHotspotSnapshot("alice", snapshot.id))?.limitations).toEqual([]);
  });
  it("云端研究缓存同样按账号和查询隔离", async () => {
    const query = { topic: "净水" };
    const snapshot = viralResearchSnapshotSchema.parse({ id: `vr-${"a".repeat(16)}-${"b".repeat(24)}`, ownerId: "alice", query, provider: "test", searchPerformed: true, fetchedAt: "2098-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", items: [], topicCards: [], commonPatterns: [], limitations: [] });
    await writeViralResearchSnapshot(snapshot, { storageRoot: root, cacheQuery: query, cacheModel: "test" });
    expect((await readCachedViralResearchSnapshot("alice", query, { model: "test" }))?.id).toBe(snapshot.id);
    expect(await readCachedViralResearchSnapshot("bob", query, { model: "test" })).toBeNull();
    expect(await readCachedViralResearchSnapshot("alice", { topic: "别的主题" }, { model: "test" })).toBeNull();
    expect(await readdir(root)).toEqual([]);
  });
  it("历史保留上限只影响当前账号的热点快照", async () => {
    await writeHotspotSnapshot({ ...hotspot(), ownerId: "bob" }, { retention: 2 });
    for (let i = 0; i < 3; i++) await writeHotspotSnapshot(hotspot(i), { retention: 2, configKey: "config" });
    expect(await readHotspotSnapshot("alice", hotspot(0).id)).toBeNull();
    expect((await readHotspotSnapshot("bob", hotspot(0).id))?.ownerId).toBe("bob");
    expect((await readLatestHotspotSnapshot("alice", "config"))?.id).toBe(hotspot(2).id);
  });
});
