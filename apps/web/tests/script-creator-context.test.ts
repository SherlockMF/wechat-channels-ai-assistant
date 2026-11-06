import { describe, expect, it } from "vitest";
import { scriptDraftInputSchema } from "@video-diagnosis/shared-types";
import { captureScriptContext, contextForRegeneration } from "@/lib/script-workbench/creator-context";
import { normalizeContentProfile } from "@/lib/settings/content-profile";
import { buildScriptGenerationPrompt } from "@/lib/script-workbench/dashscope-provider";

const context = {
  capturedAt: "2026-11-06T00:00:00.000Z",
  styleDigest: "短句，以现场观察开头。",
  styleExcerpts: ["这次先看现场。"],
  materials: [{ id: "case-1", title: "厨房返工", kind: "案例", body: "现场留有一张返工记录。" }],
  section: { id: "section-1", name: "施工案例", purpose: "讲真实过程", guide: "先问题后处理", fields: [{ id: "result", label: "实际结果", required: true }] },
  sectionInputs: { result: "业主确认验收" },
};

describe("创作资料接入脚本", () => {
  it("保留栏目、字段和选题池引用，限制超长资料输入", () => {
    expect(scriptDraftInputSchema.parse({ idea: "返工记录", creatorSectionId: "section-1", creatorSectionInputs: { result: "业主确认验收" }, creatorTopicId: "topic-1" })).toMatchObject({ creatorSectionId: "section-1", creatorSectionInputs: { result: "业主确认验收" }, creatorTopicId: "topic-1" });
    expect(scriptDraftInputSchema.safeParse({ idea: "测试", creatorSectionInputs: { result: "a".repeat(6001) } }).success).toBe(false);
  });

  it("快照独立于可变设置，且不带入多余字段或凭证", () => {
    const profile = { accountName: "现场记录", toneGuide: "口语", audiences: ["装修业主"], apiKey: "test-only-not-a-secret" };
    const original = structuredClone(context);
    const saved = captureScriptContext(profile, original);
    profile.accountName = "另一个定位";
    profile.audiences.push("新增受众");
    original.materials[0]!.body = "后来修改";
    expect(saved.accountProfileSnapshot.accountName).toBe("现场记录");
    expect(saved.accountProfileSnapshot.audiences).toEqual(["装修业主"]);
    expect(saved.accountProfileSnapshot).not.toHaveProperty("apiKey");
    expect(saved.creatorContextSnapshot.materials[0]!.body).toBe("现场留有一张返工记录。");
  });

  it("真实生成提示词包含风格与栏目素材，并区分素材和指令", () => {
    const prompt = buildScriptGenerationPrompt({ format: "koubo", topic: "hydro", subTopics: [], processKinds: [], input: { idea: "厨房返工记录" }, creatorContext: context });
    expect(prompt).toContain("短句，以现场观察开头");
    expect(prompt).toContain("现场留有一张返工记录");
    expect(prompt).toContain("业主确认验收");
    expect(prompt).toContain("不可信");
  });

  it("再生成使用独立历史快照，不要求已删除的栏目或选题仍然存在", () => {
    const draft = { accountProfileSnapshot: normalizeContentProfile({ accountName: "当时的账号" }), creatorContextSnapshot: structuredClone(context), input: { idea: "旧稿", creatorSectionId: "deleted-section", creatorTopicId: "deleted-topic" } };
    const frozen = contextForRegeneration(draft);
    expect(frozen?.creatorContextSnapshot.section?.name).toBe("施工案例");
    expect(frozen?.accountProfileSnapshot.accountName).toBe("当时的账号");
    draft.creatorContextSnapshot!.section!.name = "后来变化";
    expect(frozen?.creatorContextSnapshot.section?.name).toBe("施工案例");
    expect(contextForRegeneration({ ...draft, creatorContextSnapshot: null })).toBeUndefined();
  });
});
