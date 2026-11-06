import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  get: vi.fn(),
  hasCredentials: vi.fn(),
  chat: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("@/lib/data/repository", () => ({
  repository: { getScriptDraft: mocked.get },
  requestOwnerId: (request: Request) => request.headers.get("x-owner-id") ?? "local-user",
}));
vi.mock("@/lib/env/load-repo-env", () => ({ ensureRepoEnvLoaded: () => undefined }));
vi.mock("@/lib/settings/credentials", () => ({
  hasResolvedDashScopeCredentials: mocked.hasCredentials,
  resolveDashScopeBaseUrl: () => "https://example.invalid/v1",
  resolveLlmModel: () => "test-model",
}));
vi.mock("@/lib/dashscope/chat-completions", () => ({ callDashScopeChatCompletions: mocked.chat }));
vi.mock("@/lib/settings/store", () => ({ loadUserSettings: mocked.settings }));

import { POST } from "@/app/api/scripts/[scriptId]/assist/route";

function request(body: unknown) {
  return new Request("http://localhost/api/scripts/script-1/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-owner-id": "owner-1" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ scriptId: "script-1" }) };
const valid = { text: "前文。需要改写。后文。", start: 3, end: 8, action: "natural" };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.get.mockResolvedValue({
    accountProfileSnapshot: { accountName: "历史账号" },
    creatorContextSnapshot: { styleDigest: "用短句" },
  });
  mocked.hasCredentials.mockReturnValue(true);
  mocked.chat.mockResolvedValue({ content: "建议正文", model: "test-model", apiKey: "must-never-return" });
  mocked.settings.mockResolvedValue({ contentProfile: { accountName: "当前账号" } });
});

describe("局部改稿 API", () => {
  it("使用所属稿件的历史定位，只返回预览不保存正文或凭证", async () => {
    const response = await POST(request(valid), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestion: "建议正文", model: "test-model" });
    expect(mocked.get).toHaveBeenCalledWith("owner-1", "script-1");
    expect(mocked.settings).not.toHaveBeenCalled();
    const prompt = mocked.chat.mock.calls[0]![0].buildBody("test-model");
    expect(prompt.messages[1].content).toContain("历史账号");
    expect(prompt.messages[1].content).toContain("用短句");
    expect(prompt.messages[1].content).toContain("需要改写。");
  });
  it("无模型配置时明确失败，不返回演示改稿", async () => {
    mocked.hasCredentials.mockReturnValue(false);
    const response = await POST(request(valid), params);
    expect(response.status).toBe(503);
    expect(mocked.chat).not.toHaveBeenCalled();
  });
  it("其他 owner 看不到的稿件不能调用模型", async () => {
    mocked.get.mockResolvedValue(null);
    const response = await POST(request(valid), params);
    expect(response.status).toBe(404);
    expect(mocked.chat).not.toHaveBeenCalled();
  });
  it("越界选区拒绝，旧稿无快照时才使用当前定位", async () => {
    expect((await POST(request({ ...valid, end: 500 }), params)).status).toBe(400);
    expect(mocked.chat).not.toHaveBeenCalled();
    mocked.get.mockResolvedValue({});
    expect((await POST(request(valid), params)).status).toBe(200);
    expect(mocked.settings).toHaveBeenCalledOnce();
  });
});
