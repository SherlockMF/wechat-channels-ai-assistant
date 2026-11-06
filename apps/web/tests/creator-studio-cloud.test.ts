import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyStudioAction, loadStudio } from "@/lib/creator-studio/service";

// 用实际 SQLite 执行 SQL，只适配 D1 的异步返回形状；不靠字符串匹配伪造数据库行为。
function d1Adapter(database: DatabaseSync, beforeWrite?: () => void) {
  return {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = {
        bind(...input: SQLInputValue[]) { values = input; return statement; },
        async all<T>() { return { results: database.prepare(sql).all(...values) as T[] }; },
        async run() {
          if (/^UPDATE creator_studio/u.test(sql)) beforeWrite?.();
          const result = database.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
  };
}

const runtime = globalThis as typeof globalThis & { __SITES_ENV__?: { DB?: ReturnType<typeof d1Adapter> } };
const previousBindings = runtime.__SITES_ENV__;
const previousRoot = process.env.CREATOR_STUDIO_STORAGE_ROOT;
let database: DatabaseSync;
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "creator-cloud-test-"));
  process.env.CREATOR_STUDIO_STORAGE_ROOT = root;
  database = new DatabaseSync(":memory:");
  runtime.__SITES_ENV__ = { DB: d1Adapter(database) };
});
afterEach(async () => {
  runtime.__SITES_ENV__ = previousBindings;
  if (previousRoot === undefined) delete process.env.CREATOR_STUDIO_STORAGE_ROOT;
  else process.env.CREATOR_STUDIO_STORAGE_ROOT = previousRoot;
  database.close();
  await rm(root, { recursive: true, force: true });
});

describe("Sites 创作资料存储", () => {
  it("有 D1 绑定时写数据库且不写临时文件系统", async () => {
    await applyStudioAction("alice", { action: "saveTopic", subject: "云端选题" });
    expect((await loadStudio("alice")).topics[0]?.subject).toBe("云端选题");
    expect((await loadStudio("bob")).topics).toEqual([]);
    expect(await readdir(root)).toEqual([]);
    expect(database.prepare("SELECT revision FROM creator_studio WHERE owner_id = ?").get("alice")?.revision).toBe(1);
  });

  it("revision 冲突后基于最新资料重试，不丢失另一个请求的修改", async () => {
    await applyStudioAction("alice", { action: "saveTopic", subject: "已有选题" });
    let injected = false;
    runtime.__SITES_ENV__ = { DB: d1Adapter(database, () => {
      if (injected) return;
      injected = true;
      const row = database.prepare("SELECT payload FROM creator_studio WHERE owner_id = ?").get("alice")!;
      const state = JSON.parse(String(row.payload));
      state.topics[0].note = "另一个请求的修改";
      database.prepare("UPDATE creator_studio SET payload = ?, revision = revision + 1 WHERE owner_id = ?").run(JSON.stringify(state), "alice");
    }) };
    await applyStudioAction("alice", { action: "saveTopic", subject: "新选题" });
    const state = await loadStudio("alice");
    expect(state.topics).toHaveLength(2);
    expect(state.topics.find((topic) => topic.subject === "已有选题")?.note).toBe("另一个请求的修改");
  });

  it("数据库损坏记录报错，不覆盖原记录", async () => {
    await loadStudio("alice");
    database.prepare("INSERT INTO creator_studio (owner_id, revision, payload) VALUES (?, ?, ?)").run("alice", 1, "{broken");
    await expect(applyStudioAction("alice", { action: "saveTopic", subject: "不可写入" })).rejects.toThrow("资料");
    expect(database.prepare("SELECT payload FROM creator_studio WHERE owner_id = ?").get("alice")?.payload).toBe("{broken");
  });
});
