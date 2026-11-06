import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/data/repository", () => ({
  repository: { getScriptDraft: mocked.get, updateScriptDraft: mocked.update },
  requestOwnerId: (request: Request) => request.headers.get("x-owner-id") ?? "local-user",
}));
import { GET } from "@/app/api/scripts/[scriptId]/route";
import { POST } from "@/app/api/scripts/[scriptId]/delivery-guide/route";
const params = { params: Promise.resolve({ scriptId: "old-draft" }) };
function request(text = "【口播稿】\n请先核对水压。") {
  return new Request("http://localhost/api/scripts/old-draft/delivery-guide", {
    method: "POST", headers: { "x-owner-id": "owner-a", "Content-Type": "application/json" }, body: JSON.stringify({ text }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.get.mockResolvedValue({ id: "old-draft", editedPlainText: "当前修改稿。", output: { pipeline: "koubo", script: "原稿。", plainText: "原稿。" } });
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
});
