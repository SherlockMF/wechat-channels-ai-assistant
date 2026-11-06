import { describe, expect, it } from "vitest";
import { parseAiDeliveryGuide } from "@/lib/script-workbench/ai-delivery-guide";
const text = "先别急着装灯。你家餐厅真的缺亮度吗？";
const data = {
  overall: { tone: "像现场看完后给朋友提建议，先拦一下再解释", pace: "开头慢半拍，问题说完留出思考", note: "不用推销腔，把问题问给镜头前的人" },
  cues: [
    { quote: "先别急着装灯。", emotion: "轻轻拦一下，别像训人", stress: ["别急", "不存在"], pause: "说完“装灯”停半拍", expression: "", gesture: "" },
    { quote: "你家餐厅真的缺亮度吗？", emotion: "真诚发问，句尾稍抬", stress: ["真的", "亮度"], pause: "问完留一拍", expression: "微微挑眉", gesture: "" },
  ],
};
describe("AI 演绎提示", () => {
  it("保留具体指导、标识真实模型来源、只接受正文重读词", () => {
    const guide = parseAiDeliveryGuide(JSON.stringify(data), text, "test-model");
    expect(guide.source).toBe("ai");
    expect(guide.model).toBe("test-model");
    expect(guide.paceHint).toBe(data.overall.pace);
    expect(guide.cameraNote).toBe(data.overall.note);
    expect(guide.blocks[0]!.segments[0]!.toneHint).toBe(data.cues[0]!.emotion);
    expect(guide.blocks[0]!.segments[0]!.emphasis).toEqual(["别急"]);
    expect(guide.blocks[0]!.segments[1]!.expression).toBe("微微挑眉");
    expect(guide.blocks[0]!.segments.map(s => s.text).join("")).toBe(text);
  });
  it("允许呼吸段包含多句，保留段间换行，动作可留空", () => {
    const quote = "先看现场。\n\n再解释。";
    const guide = parseAiDeliveryGuide(JSON.stringify({ ...data, cues: [{ ...data.cues[0], quote, stress: [] }] }), quote, "m");
    expect(guide.blocks[0]!.segments).toHaveLength(1);
    expect(guide.blocks[0]!.segments[0]!.action).toBe("");
  });
  it.each([
    { ...data, cues: [{ ...data.cues[0], quote: "编造了另一句。" }] },
    { ...data, cues: [...data.cues].reverse() },
    { ...data, cues: [data.cues[0]] },
  ])("拒绝改写、乱序或漏掉口播，不伪造成功", invalid => {
    expect(() => parseAiDeliveryGuide(JSON.stringify(invalid), text, "m")).toThrow();
  });
  it("坏 JSON 和空泛缺失结构不能变成规则稿冒充 AI", () => {
    expect(() => parseAiDeliveryGuide("不是 JSON", text, "m")).toThrow();
    expect(() => parseAiDeliveryGuide('{}', text, "m")).toThrow();
  });
});
