import { describe, expect, it } from "vitest";
import {
  scriptDraftFormatSchema,
  scriptDraftOutputSchema,
} from "@video-diagnosis/shared-types";
import {
  isKouboFormat,
  topicRequired,
} from "@/lib/script-workbench/catalog";
import { buildMockScriptOutput } from "@/lib/script-workbench/mock-generate";

describe("script draft schemas", () => {
  it("accepts koubo output shape", () => {
    const parsed = scriptDraftOutputSchema.parse({
      pipeline: "koubo",
      titles: ["标题A", "标题B"],
      tags: ["全屋净水"],
      script: "口播正文",
      brollCues: [{ section: "开头", cue: "软水起泡特写" }],
      subtitleBeats: ["用了就离不开"],
      altHooks: ["谁懂硬水的痛"],
      positioning: null,
      timeline: [],
      gapsOrWarnings: [],
      plainText: "口播正文",
    });
    expect(parsed.pipeline).toBe("koubo");
  });

  it("accepts vlog format enum", () => {
    expect(scriptDraftFormatSchema.parse("vlog")).toBe("vlog");
  });
});

describe("script workbench catalog and mock", () => {
  it("vlog does not require topic", () => {
    expect(topicRequired("vlog")).toBe(false);
    expect(isKouboFormat("koubo")).toBe(true);
    expect(topicRequired("koubo")).toBe(true);
  });

  it("mock koubo returns script and plainText", () => {
    const out = buildMockScriptOutput({
      format: "koubo",
      topic: "water",
      subTopics: [],
      processKinds: [],
      input: { idea: "软水机离不开" },
    });
    expect(out.pipeline).toBe("koubo");
    expect(out.script.length).toBeGreaterThan(10);
    expect(out.plainText).toContain("软水");
  });

  it("mock service_process returns timeline", () => {
    const out = buildMockScriptOutput({
      format: "service_process",
      topic: "hydro",
      subTopics: [],
      processKinds: ["install_inspect"],
      input: { idea: "验水电标准", mustShoot: "线管间距" },
    });
    expect(out.pipeline).toBe("follow");
    expect(out.timeline.length).toBeGreaterThan(2);
    expect(out.gapsOrWarnings.some((item) => item.includes("门牌"))).toBe(true);
  });

  it("list title avoids spoken-body dump", async () => {
    const { resolveDraftListTitle, summarizeIdea } = await import(
      "@/lib/script-workbench/display"
    );
    expect(
      summarizeIdea({
        idea: "厨房做饭油腻不想开窗",
        existingScript: "天天在厨房做饭，油烟大……",
      }),
    ).toBe("厨房做饭油腻不想开窗");

    const title = resolveDraftListTitle({
      id: "1",
      ownerId: "u",
      format: "koubo",
      topic: "smart_home",
      formatOther: null,
      topicOther: null,
      subTopics: ["curtain"],
      processKinds: [],
      title:
        "天天在厨房做饭，油烟大、手上全是油污，还要伸手去拉窗帘，真的太麻烦了！（7-25秒产品展示",
      ideaSummary:
        "天天在厨房做饭，油烟大、手上全是油污，还要伸手去拉窗帘，真的太麻烦了！",
      input: {
        idea: "厨房做饭油腻不想开窗",
        existingScript: "天天在厨房做饭……",
      },
      output: {
        pipeline: "koubo",
        titles: [
          "天天在厨房做饭，油烟大、手上全是油污，还要伸手去拉窗帘，真的太麻烦了！",
        ],
        tags: [],
        script: "正文",
        brollCues: [],
        subtitleBeats: [],
        altHooks: [],
        positioning: null,
        timeline: [],
        gapsOrWarnings: [],
        plainText: "正文",
      },
      status: "ready",
      provider: "dashscope",
      referenceVideoIds: [],
      createdAt: "",
      updatedAt: "",
    });
    expect(title).not.toContain("油烟大");
    expect(title.length).toBeLessThanOrEqual(30);
  });
});
