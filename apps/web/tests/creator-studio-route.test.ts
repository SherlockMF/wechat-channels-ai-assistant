import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getScriptDraft } = vi.hoisted(() => ({ getScriptDraft: vi.fn() }));
vi.mock("@/lib/data/repository", () => ({
  requestOwnerId: (request: Request) => request.headers.get("x-owner-id") || "local-user",
  repository: { getScriptDraft },
}));

import { GET, POST } from "@/app/api/creator-studio/route";

const previousRoot = process.env.CREATOR_STUDIO_STORAGE_ROOT;
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "creator-route-test-"));
  process.env.CREATOR_STUDIO_STORAGE_ROOT = root;
  getScriptDraft.mockReset();
});
afterEach(async () => {
  if (previousRoot === undefined) delete process.env.CREATOR_STUDIO_STORAGE_ROOT;
  else process.env.CREATOR_STUDIO_STORAGE_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
});

function request(body: unknown, owner = "alice") {
  return new Request("http://localhost/api/creator-studio", {
    method: "POST", headers: { "Content-Type": "application/json", "x-owner-id": owner }, body: JSON.stringify(body),
  });
}

describe("创作资料 API", () => {
  it("完整保存并返回资料状态，不向其他 owner 暴露资料", async () => {
    const saved = await POST(request({ action: "saveTopic", subject: "施工避坑", source: "热点", planDate: "2026-11-12" }));
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.state.topics[0]).toMatchObject({ subject: "施工避坑", source: "热点", planDate: "2026-11-12" });
    const response = await GET(new Request("http://localhost/api/creator-studio", { headers: { "x-owner-id": "bob" } }));
    expect((await response.json()).state.topics).toEqual([]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("拒绝无效 JSON、未知 action、不合法日期和超大请求", async () => {
    expect((await POST(new Request("http://localhost/api/creator-studio", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request({ action: "unknown" }))).status).toBe(400);
    expect((await POST(request({ action: "saveTopic", subject: "测试", planDate: "2026-13-01" }))).status).toBe(400);
    expect((await POST(request({ action: "saveSample", title: "过大", content: "字".repeat(100_001) }))).status).toBe(413);
  });

  it("样本关联稿件必须属于当前 owner", async () => {
    getScriptDraft.mockResolvedValue(null);
    const draftId = "999857fb-f5e6-4a4e-91d7-34c4e7d37e20";
    const response = await POST(request({ action: "saveSample", title: "确认稿", content: "确认的口播稿。".repeat(30), draftId }));
    expect(response.status).toBe(404);
    expect(getScriptDraft).toHaveBeenCalledWith("alice", draftId);
    const loaded = await GET(new Request("http://localhost/api/creator-studio", { headers: { "x-owner-id": "alice" } }));
    expect((await loaded.json()).state.samples).toEqual([]);
  });
});
