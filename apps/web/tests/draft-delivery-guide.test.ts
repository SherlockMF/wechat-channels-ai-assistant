import { describe, expect, it } from "vitest";
import type { ScriptDraftOutput } from "@video-diagnosis/shared-types";
import { ensureDeliveryGuide, guideForCurrentText } from "@/lib/script-workbench/delivery-guide";

const output = {
  pipeline: "koubo", script: "先看水压。不要急着安装！", plainText: "【口播稿】\n先看水压。不要急着安装！\n【穿插素材】\n接口特写。",
} as ScriptDraftOutput;

describe("已有稿件演讲提示", () => {
  it("无攻略的旧稿自动补齐，保持原稿不变并明确规则来源", () => {
    const before = structuredClone(output);
    const guide = guideForCurrentText(output, output.plainText);
    expect(guide?.blocks[0]?.segments.map(s => s.text).join("")).toBe(output.script);
    expect(guide?.warnings.join("")).toContain("本地规则");
    expect(output).toEqual(before);
    expect(guide?.blocks[0]?.segments[1]?.emotion).toBe("serious");
  });
  it("保留原有对齐攻略的语气和人工/模型提示", () => {
    const enriched = ensureDeliveryGuide(output);
    enriched.deliveryGuide!.overallTone = "轻松聊天";
    expect(guideForCurrentText(enriched, output.plainText)).toEqual(enriched.deliveryGuide);
  });
  it("手改后只给当前口播提示，不沿用旧稿语气及拍摄素材", () => {
    const enriched = ensureDeliveryGuide(output);
    enriched.deliveryGuide!.overallTone = "旧稿的兴奋语气";
    const guide = guideForCurrentText(enriched, "【口播稿】\n这里先停一下。请核对接口。\n【穿插素材】\n不要读这个。");
    expect(guide?.blocks.map(b => b.sourceText).join("")).toBe("这里先停一下。请核对接口。");
    expect(guide?.overallTone).not.toContain("旧稿");
  });
  it("保留分镜的多行口播，排除画面和字幕", () => {
    const guide = guideForCurrentText(output, "【分镜】\n说：第一句话。\n接着第二句。\n拍：接口特写\n说：最后一句。\n字幕：不能念。");
    expect(guide?.blocks.map(b => b.sourceText).join("")).toBe("第一句话。\n接着第二句。\n\n最后一句。");
  });
  it("已删空正文不能恢复旧稿提示", () => {
    expect(guideForCurrentText(output, "【口播稿】\n\n【穿插素材】\n特写")).toBeNull();
    expect(guideForCurrentText(output, "")).toBeNull();
  });
  it("分镜正文的段间空行不应丢失原有对齐攻略", () => {
    const timeline = ensureDeliveryGuide({ ...output, pipeline: "follow", timeline: [{ order: 1, say: "第一句。", shoot: "特写", subtitle: "" }, { order: 2, say: "第二句。", shoot: "中景", subtitle: "" }] });
    timeline.deliveryGuide!.overallTone = "保留模型语气";
    const guide = guideForCurrentText(timeline, "说：第一句。\n拍：特写\n说：第二句。");
    expect(guide).toEqual(timeline.deliveryGuide);
  });
  it("多行正文不会生成只有换行的空白提示段", () => {
    const guide = guideForCurrentText(null, "第一句。\n\n第二句。");
    expect(guide!.blocks.flatMap(b => b.segments).every(s => Boolean(s.text.trim()))).toBe(true);
    expect(guide!.blocks[0]!.segments.map(s => s.text).join("")).toBe("第一句。\n\n第二句。");
  });
});
