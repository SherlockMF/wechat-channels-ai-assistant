import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/script-workbench/ai-delivery-guide", () => ({ generateAiDeliveryGuide: mocked.generate }));
vi.mock("@/lib/data/repository", () => ({
  repository: { getScriptDraft: mocked.get, updateScriptDraft: mocked.update },
  requestOwnerId: (request: Request) => request.headers.get("x-owner-id") ?? "local-user",
}));
import { GET } from "@/app/api/scripts/[scriptId]/route";
import { POST } from "@/app/api/scripts/[scriptId]/delivery-guide/route";
import { guideForCurrentText, hashSource } from "@/lib/script-workbench/delivery-guide";
const params = { params: Promise.resolve({ scriptId: "old-draft" }) };
function request(text = "【口播稿】\n请先核对水压。", mode: "basic" | "ai" = "basic") {
  return new Request("http://localhost/api/scripts/old-draft/delivery-guide", {
    method: "POST", headers: { "x-owner-id": "owner-a", "Content-Type": "application/json" }, body: JSON.stringify({ text, mode }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.get.mockResolvedValue({ id: "old-draft", editedPlainText: "当前修改稿。", output: { pipeline: "koubo", script: "原稿。", plainText: "原稿。" } });
  mocked.generate.mockResolvedValue({ ...guideForCurrentText(null, "当前修改稿。"), source: "ai", model: "test", documentHash: hashSource("当前修改稿。") });
  mocked.update.mockResolvedValue({ id: "old-draft" });
});
describe("口播演讲提示 API", () => {
  it("读取旧稿给当前编辑正文补齐提示，不写入原稿", async () => {
    const response = await GET(request(), params);
    const body = await response.json();
    expect(body.rehearsalGuide.blocks[0].sourceText).toBe("当前修改稿。");
    expect(body.draft.output.deliveryGuide).toBeUndefined();
    expect(mocked.update).not.toHaveBeenCalled();
  });
  it("当前文本生成提示，检查 owner，禁止改写正文", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect((await response.json()).guide.blocks[0].sourceText).toBe("请先核对水压。");
    expect(mocked.get).toHaveBeenCalledWith("owner-a", "old-draft");
    expect(mocked.update).not.toHaveBeenCalled();
  });
  it("其他账号稿件、空口播和过长文本明确拒绝", async () => {
    expect((await POST(request("【口播稿】\n\n【穿插素材】\n镜头"), params)).status).toBe(400);
    expect((await POST(request("字".repeat(200_001)), params)).status).toBe(400);
    mocked.get.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(404);
  });
  it("AI 提示单独保存，刷新仍能读取，正文从未被写入", async () => {
    expect((await POST(request("当前修改稿。", "ai"), params)).status).toBe(200);
    expect(mocked.generate).toHaveBeenCalledOnce();
    const patch = mocked.update.mock.calls[0]![2];
    expect(mocked.update.mock.calls[0]![3]).toBe("当前修改稿。");
    expect(Object.keys(patch)).toEqual(["rehearsalGuide"]);
    mocked.get.mockResolvedValue({ editedPlainText: "当前修改稿。", rehearsalGuide: patch.rehearsalGuide });
    expect((await (await GET(request(), params)).json()).rehearsalGuide.source).toBe("ai");
    mocked.get.mockResolvedValue({ editedPlainText: "改掉了正文。", rehearsalGuide: patch.rehearsalGuide });
    expect((await (await GET(request(), params)).json()).rehearsalGuide.source).toBe("rules");
  });
  it("未保存或生成期间正文变化不保存旧提示", async () => {
    expect((await POST(request("尚未保存。", "ai"), params)).status).toBe(409);
    expect(mocked.generate).not.toHaveBeenCalled();
    mocked.get.mockResolvedValueOnce({ editedPlainText: "当前修改稿。" }).mockResolvedValueOnce({ editedPlainText: "另一个版本。" });
    expect((await POST(request("当前修改稿。", "ai"), params)).status).toBe(409);
    expect(mocked.update).not.toHaveBeenCalled();
  });
  it("写入排队期间正文变化时，仓储的冲突不能变成成功响应", async () => {
    mocked.update.mockRejectedValueOnce(Object.assign(new Error("生成期间正文已变化"), { status: 409 }));
    expect((await POST(request("当前修改稿。", "ai"), params)).status).toBe(409);
  });
  it("模型失败保留已有提示并返回错误，不能返回规则成功", async () => {
    mocked.generate.mockRejectedValue(new Error("模型无调用权限"));
    const response = await POST(request("当前修改稿。", "ai"), params);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("无调用权限");
    expect(mocked.update).not.toHaveBeenCalled();
  });
});
