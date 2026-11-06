import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeliveryGuidePanel } from "@/features/script-workbench/delivery-guide-panel";
import { SpokenCueText } from "@/features/script-workbench/spoken-cue-text";
import { ScriptTeleprompter } from "@/features/script-workbench/script-teleprompter";
import { parseAiDeliveryGuide } from "@/lib/script-workbench/ai-delivery-guide";
import { guideForCurrentText } from "@/lib/script-workbench/delivery-guide";

const text = "先别急着装灯。";
const guide = parseAiDeliveryGuide(JSON.stringify({ overall: { tone: "像给朋友提建议", pace: "先慢半拍", note: "不用推销腔" }, cues: [{ quote: text, emotion: "轻轻拦一下，别像训人", stress: ["别急"], pause: "装灯后停半拍", expression: "微微挑眉", gesture: "" }] }), text, "test-model");
const props = { busy: false, error: "", canGenerate: true, readOnly: false, onGenerate() {}, onCancel() {}, onCopy() {}, onPrompter() {} };
describe("口播提示展示", () => {
  it("原文突出重读、呈现具体提示，AI 模式不展示兼容占位情绪", () => {
    const html = renderToStaticMarkup(<DeliveryGuidePanel {...props} guide={guide} />);
    for (const value of ["整体基调", "语速节奏", "出镜提醒", "轻轻拦一下", "装灯后停半拍", "微微挑眉", "重新生成 AI 口播提示"]) expect(html).toContain(value);
    expect(html).toMatch(/<strong[^>]*>别急<\/strong>/u);
    expect(html).not.toContain("中性 1/3");
    expect(html).not.toContain("保持自然手势");
  });
  it("提词器使用同一具体提示，基础模式必须明确标注非 AI", () => {
    const html = renderToStaticMarkup(<ScriptTeleprompter text={text} guide={guide} onClose={() => {}} />);
    expect(html).toContain("轻轻拦一下");
    expect(html).toContain("装灯后停半拍");
    expect(html).not.toContain("中性 1/3");
    const basic = guideForCurrentText(null, text)!;
    expect(renderToStaticMarkup(<ScriptTeleprompter text={text} guide={basic} onClose={() => {}} />)).toContain("基础规则提示（非 AI）");
    const panel = renderToStaticMarkup(<DeliveryGuidePanel {...props} guide={basic} />);
    expect(panel).toContain("<details");
    expect(panel).not.toContain("<details open");
  });
  it("重读中的正则和 HTML 字符按普通文本处理", () => {
    const html = renderToStaticMarkup(<SpokenCueText text="A+B 与 <script>" emphasis={["A+B", "<script>", "不存在"]} />);
    expect(html).toMatch(/<strong[^>]*>A\+B<\/strong>/u);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
