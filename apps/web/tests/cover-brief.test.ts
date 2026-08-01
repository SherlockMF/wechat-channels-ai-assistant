import { describe, expect, it } from "vitest";
import {
  buildMockCoverBrief,
  buildPastePrompt,
  formatCoverBriefOptions,
  parseCoverBriefOutput,
} from "@/lib/draft-review/cover-brief-provider";
import { parseCoverBriefOptionsFromForm } from "@/lib/draft-review/cover-brief-options";

describe("parseCoverBriefOutput", () => {
  it("优先使用 pastePrompt 整段", () => {
    const result = parseCoverBriefOutput({
      pastePrompt: "我已附上同一张实景照片。请生成 3:4 封面。",
      titles: ["标题A", "标题B"],
    });
    expect(result.pastePrompt).toContain("同一张实景照片");
    expect(result.titles).toEqual(["标题A", "标题B"]);
  });

  it("缺字段时仍给出可粘贴整段", () => {
    const result = parseCoverBriefOutput({});
    expect(result.pastePrompt).toContain("实景照片");
    expect(result.pastePrompt).toContain("3:4");
    expect(result.titles.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildMockCoverBrief", () => {
  it("只产出一整段发给 GPT 的提示词", () => {
    const result = buildMockCoverBrief({
      backgroundPath: "/tmp/a.jpg",
      backgroundMimeType: "image/jpeg",
      userDescription:
        "江南映像小区这套房，我们做了精工水电，要突出全屋智能和全屋净水",
      context: {
        title: "江南映像精工水电",
        tags: ["全屋智能", "全屋净水"],
        goal: "完播",
        diagnosisSummary: "开头偏弱",
        problemCategories: ["hook"],
      },
      options: {
        style: "site_real",
        themeColor: "blue_orange_green",
        aspectRatio: "9:16",
        mood: "trust",
        overlay: "medium",
      },
    });
    expect(result.pastePrompt).toContain("我已附上同一张实景照片");
    expect(result.pastePrompt).toContain("9:16");
    expect(result.pastePrompt).toContain("实景工地");
    expect(result.pastePrompt).toContain("蓝");
    expect(result.pastePrompt).toMatch(/江南映像|精工水电/);
  });
});

describe("formatCoverBriefOptions", () => {
  it("未选则不输出任何行", () => {
    expect(
      formatCoverBriefOptions({
        style: null,
        themeColor: null,
        aspectRatio: null,
        mood: null,
        overlay: null,
      }),
    ).toEqual([]);
  });
});

describe("parseCoverBriefOptionsFromForm", () => {
  it("预设与自定义文案均可，空值忽略", () => {
    const form = new FormData();
    form.set("style", "site_real");
    form.set("themeColor", "墨绿描边");
    form.set("aspectRatio", "9:16");
    form.set("mood", "   ");
    const options = parseCoverBriefOptionsFromForm(form);
    expect(options.style).toBe("site_real");
    expect(options.themeColor).toBe("墨绿描边");
    expect(options.aspectRatio).toBe("9:16");
    expect(options.mood).toBeNull();
  });
});

describe("buildPastePrompt", () => {
  it("把可选偏好写进同一段提示词", () => {
    const prompt = buildPastePrompt({
      topic: "精工水电",
      userDescription: "这套房水电实录",
      tags: ["全屋智能", "全屋净水"],
      goal: "引流",
      imageAnalysis: "浅色外立面住宅，晴天侧光。",
      titles: ["我们做的不只是水电，更是几十年的安心", "全屋智能 + 全屋净水"],
      options: {
        style: "site_real",
        themeColor: "blue_orange_green",
        aspectRatio: "9:16",
        mood: "trust",
        overlay: "medium",
      },
    });
    expect(prompt).toMatch(/同一张实景照片/);
    expect(prompt).toMatch(/9:16/);
    expect(prompt).toMatch(/用户指定偏好/);
    expect(prompt).toMatch(/几十年的安心/);
  });
});
