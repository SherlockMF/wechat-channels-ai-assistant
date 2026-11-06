import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadStudio, studioFilePath } from "@/lib/creator-studio/store";
import {
  applyStudioAction,
  buildCreatorContext,
  creatorContextPrompt,
  learnStyle,
  markTopicWritten,
  recallMaterials,
} from "@/lib/creator-studio/service";
import { studioActionSchema } from "@/lib/creator-studio/types";

const previousRoot = process.env.CREATOR_STUDIO_STORAGE_ROOT;
let root: string;
const content = "这是一篇作者确认过的真实口播稿。先交代现场，再解释问题，最后给出具体做法。不要编造客户的经历，也不要随意替换实际数据。".repeat(3);

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "creator-studio-test-"));
  process.env.CREATOR_STUDIO_STORAGE_ROOT = root;
});
afterEach(async () => {
  if (previousRoot === undefined) delete process.env.CREATOR_STUDIO_STORAGE_ROOT;
  else process.env.CREATOR_STUDIO_STORAGE_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
});

describe("创作资料存储", () => {
  it("并发写入不丢条目且 owner 互不读取", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      applyStudioAction("alice", { action: "saveMaterial", title: `案例${index}`, kind: "案例", body: "净水施工中的真实案例", tags: ["净水"] }),
    ));
    expect((await loadStudio("alice")).materials).toHaveLength(8);
    expect((await loadStudio("bob")).materials).toHaveLength(0);
    expect(path.dirname(studioFilePath("../../outside"))).toBe(root);
  });

  it("坏文件报错而不会覆盖成空资料库", async () => {
    await applyStudioAction("alice", { action: "saveTopic", subject: "净水选题" });
    const file = studioFilePath("alice");
    await writeFile(file, "{broken", "utf8");
    await expect(applyStudioAction("alice", { action: "saveTopic", subject: "另一个题目" })).rejects.toThrow("资料文件无法读取");
    expect(await readFile(file, "utf8")).toBe("{broken");
  });

  it("不能修改其他 owner 的条目，也不会把不存在的 id 当新增", async () => {
    const state = await applyStudioAction("alice", { action: "saveMaterial", title: "案例", kind: "案例", body: "现场案例", tags: [] });
    await expect(applyStudioAction("bob", { action: "saveMaterial", id: state.materials[0]!.id, title: "覆盖", kind: "案例", body: "覆盖", tags: [] })).rejects.toThrow("不存在");
    await expect(applyStudioAction("bob", { action: "delete", kind: "material", id: state.materials[0]!.id })).rejects.toThrow("不存在");
  });

  it("在 Windows 上仅大小写不同的 owner 仍然隔离", async () => {
    await applyStudioAction("Alice", { action: "saveTopic", subject: "仅 Alice 可见" });
    expect((await loadStudio("alice")).topics).toHaveLength(0);
    expect(studioFilePath("Alice").toLowerCase()).not.toBe(studioFilePath("alice").toLowerCase());
  });

  it("拒绝不真实的日期、重复栏目字段以及超短语气样本", () => {
    expect(studioActionSchema.safeParse({ action: "saveTopic", subject: "选题", planDate: "2026-02-30" }).success).toBe(false);
    expect(studioActionSchema.safeParse({ action: "saveTopic", subject: "选题", planDate: "2026-02-28" }).success).toBe(true);
    expect(studioActionSchema.safeParse({ action: "saveSample", title: "短稿", content: "太短" }).success).toBe(false);
    expect(studioActionSchema.safeParse({ action: "saveSection", name: "案例", purpose: "", guide: "", fields: [{ id: "case", label: "案例", required: true }, { id: "case", label: "结果", required: true }] }).success).toBe(false);
  });
});

describe("语气样本与学习", () => {
  it("明确学习才生成档案；增删样本立刻使旧档案失效", async () => {
    let state = await applyStudioAction("alice", { action: "saveSample", title: "第一篇", content });
    expect(state.styleDigest).toBe("");
    state = await learnStyle("alice", async () => "- 先给现场，再解释原因。\n- 使用短句。");
    expect(state.styleDigest).toContain("短句");
    state = await applyStudioAction("alice", { action: "saveSample", title: "第二篇", content: content + "结尾补充一句。" });
    expect(state.styleDigest).toBe("");
    expect(state.styleUpdatedAt).toBeNull();
    state = await applyStudioAction("alice", { action: "delete", kind: "sample", id: state.samples[0]!.id });
    expect(state.samples).toHaveLength(1);
    expect(state.styleDigest).toBe("");
  });

  it("模型学习失败保留原样本，不制造演示档案", async () => {
    await applyStudioAction("alice", { action: "saveSample", title: "稿件", content });
    await expect(learnStyle("alice", async () => { throw new Error("模型不可用"); })).rejects.toThrow("模型不可用");
    const state = await loadStudio("alice");
    expect(state.samples).toHaveLength(1);
    expect(state.styleDigest).toBe("");
  });

  it("学习期间样本发生变化时拒绝写回过期档案", async () => {
    const state = await applyStudioAction("alice", { action: "saveSample", title: "稿件", content });
    await expect(learnStyle("alice", async () => {
      await applyStudioAction("alice", { action: "delete", kind: "sample", id: state.samples[0]!.id });
      return "- 这份档案已过期";
    })).rejects.toThrow("样本已变化");
    expect((await loadStudio("alice")).styleDigest).toBe("");
    await expect(learnStyle("alice", async () => "任何输出")).rejects.toThrow("先加入");
  });
});

describe("素材与栏目生成上下文", () => {
  it("按主题召回且限制六条，无关素材不进入提示词", async () => {
    for (let i = 0; i < 8; i += 1) {
      await applyStudioAction("alice", { action: "saveMaterial", title: `净水施工案例${i}`, body: "净水设备安装后检查接头", kind: "案例", tags: ["净水", "安装"] });
    }
    await applyStudioAction("alice", { action: "saveMaterial", title: "晚餐", body: "周末做饭", kind: "经历", tags: ["烹饪"] });
    const state = await loadStudio("alice");
    expect(recallMaterials(state.materials, "净水设备安装")).toHaveLength(6);
    expect(recallMaterials(state.materials, "金融投资")).toHaveLength(0);
    const snapshot = await buildCreatorContext("alice", { topic: "净水设备安装" });
    expect(snapshot.materials).toHaveLength(6);
    expect(creatorContextPrompt(snapshot)).toContain("不能编造");
    expect(creatorContextPrompt(snapshot)).not.toContain("周末做饭");
  });

  it("必填栏目素材验证，未知字段剔除，快照不随源更新改变", async () => {
    const state = await applyStudioAction("alice", { action: "saveSection", name: "客户案例", purpose: "记录真实项目", guide: "先说问题再说处理", fields: [{ id: "problem", label: "现场问题", required: true }] });
    const section = state.sections[0]!;
    await expect(buildCreatorContext("alice", { topic: "案例", sectionId: section.id })).rejects.toThrow("现场问题");
    const snapshot = await buildCreatorContext("alice", { topic: "案例", sectionId: section.id, sectionInputs: { problem: "水压不足", extra: "不应保留" } });
    expect(snapshot.sectionInputs).toEqual({ problem: "水压不足" });
    await applyStudioAction("alice", { action: "saveSection", ...section, name: "修改后的栏目" });
    expect(snapshot.section?.name).toBe("客户案例");
    expect(creatorContextPrompt(snapshot)).toContain("水压不足");
    await expect(buildCreatorContext("bob", { topic: "案例", sectionId: section.id })).rejects.toThrow("栏目不存在");
  });
});

describe("选题池", () => {
  it("保存日期来源，生成成功才标记关联，允许恢复待写", async () => {
    let state = await applyStudioAction("alice", { action: "saveTopic", subject: "净水选购", source: "热点", planDate: "2026-11-10", status: "planned" });
    const topic = state.topics[0]!;
    expect(topic.draftId).toBeNull();
    await markTopicWritten("alice", topic.id, "c452a423-6d8c-4dd5-9843-f888857fb4fa");
    state = await loadStudio("alice");
    expect(state.topics[0]).toMatchObject({ status: "done", draftId: "c452a423-6d8c-4dd5-9843-f888857fb4fa", source: "热点", planDate: "2026-11-10" });
    state = await applyStudioAction("alice", { action: "saveTopic", ...state.topics[0]!, status: "idea", draftId: null });
    expect(state.topics[0]).toMatchObject({ status: "idea", draftId: null });
  });
});
