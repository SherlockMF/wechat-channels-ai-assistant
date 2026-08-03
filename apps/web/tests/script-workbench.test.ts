import { describe, expect, it } from "vitest";
import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import {
  scriptDraftFormatSchema,
  scriptDraftOutputSchema,
  type ScriptDraftProcessKind,
  type ScriptDraftSmartSubTopic,
} from "@video-diagnosis/shared-types";
import {
  isKouboFormat,
  topicRequired,
} from "@/lib/script-workbench/catalog";
import { preferScriptBody } from "@/lib/script-workbench/display";
import { buildMockScriptOutput } from "@/lib/script-workbench/mock-generate";
import {
  outputToPlainText,
  plainTextDivergesFromStructured,
} from "@/lib/script-workbench/plain-text";
import {
  finalizeScriptOutput,
  sanitizeScriptInput,
} from "@/lib/script-workbench/production-guide";
import {
  findScriptReferences,
  recordsOwnedBy,
} from "@/lib/script-workbench/references";

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

  it("accepts productionGuide on output", () => {
    const parsed = scriptDraftOutputSchema.parse({
      pipeline: "koubo",
      titles: ["标题A"],
      tags: [],
      script: "口播",
      brollCues: [],
      subtitleBeats: [],
      altHooks: [],
      positioning: null,
      timeline: [],
      gapsOrWarnings: [],
      productionGuide: {
        shootStatus: "unshot",
        editGuidance: ["前3秒抓停留"],
        materials: [],
        storyboard: [
          {
            order: 1,
            shot: "痛点特写",
            camera: "近景",
            durationHint: "3～5秒",
            voiceCue: "开头",
          },
        ],
      },
      plainText: "口播",
    });
    expect(parsed.productionGuide?.shootStatus).toBe("unshot");
    expect(parsed.productionGuide?.storyboard).toHaveLength(1);
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
    expect(out.productionGuide?.shootStatus).toBe("unshot");
    expect(out.productionGuide?.storyboard.length).toBeGreaterThan(0);
    expect(out.productionGuide?.materials).toEqual([]);
    expect(out.plainText).toContain("拍摄与剪辑指导");
  });

  it("mock shot status returns materials and uses materialNotes", () => {
    const out = buildMockScriptOutput({
      format: "koubo",
      topic: "water",
      subTopics: [],
      processKinds: [],
      input: {
        idea: "软水机离不开",
        shootStatus: "shot",
        materialNotes: "厨房龙头泡沫对比",
      },
    });
    expect(out.productionGuide?.shootStatus).toBe("shot");
    expect(out.productionGuide?.storyboard).toEqual([]);
    expect(out.productionGuide?.materials.length).toBeGreaterThan(0);
    expect(
      out.productionGuide?.materials.some((item) =>
        item.description.includes("厨房龙头泡沫对比"),
      ),
    ).toBe(true);
    expect(out.productionGuide?.editGuidance.length).toBeGreaterThan(0);
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
    expect(out.productionGuide?.storyboard.length).toBeGreaterThan(0);
  });

  it("internalNote does not appear in copyable gapsOrWarnings", () => {
    const out = buildMockScriptOutput({
      format: "project_finish",
      topic: "smart_home",
      subTopics: [],
      processKinds: [],
      input: {
        idea: "全屋交付亮点",
        internalNote: "客户要求不露脸",
      },
    });
    expect(
      out.gapsOrWarnings.some((item) => item.includes("客户要求不露脸")),
    ).toBe(false);
    expect(out.plainText).not.toContain("客户要求不露脸");
  });

  it("normalize forces shootStatus and XOR arrays from input", () => {
    const request = {
      format: "koubo" as const,
      topic: "water" as const,
      subTopics: [] as ScriptDraftSmartSubTopic[],
      processKinds: [] as ScriptDraftProcessKind[],
      input: { idea: "软水", shootStatus: "shot" as const },
    };
    const dirty = buildMockScriptOutput({
      ...request,
      input: { idea: "软水", shootStatus: "unshot" },
    });
    const fixed = finalizeScriptOutput(request, {
      ...dirty,
      productionGuide: {
        shootStatus: "unshot",
        editGuidance: ["旧建议"],
        materials: [],
        storyboard: [
          {
            order: 1,
            shot: "错的分镜",
            camera: "近景",
            durationHint: "3秒",
            voiceCue: "开头",
          },
        ],
      },
    });
    expect(fixed.productionGuide?.shootStatus).toBe("shot");
    expect(fixed.productionGuide?.storyboard).toEqual([]);
    expect(fixed.productionGuide?.materials.length).toBeGreaterThan(0);
    expect(fixed.plainText).toContain("素材描述");
    expect(fixed.plainText).not.toContain("拍摄分镜");
  });

  it("preferScriptBody then finalize keeps script and rebuilds guide", () => {
    const existing =
      "这是用户自己写的超长口播正文，用来覆盖模型改写结果。";
    const request = {
      format: "koubo" as const,
      topic: "water" as const,
      subTopics: [] as ScriptDraftSmartSubTopic[],
      processKinds: [] as ScriptDraftProcessKind[],
      input: {
        idea: "软水",
        existingScript: existing,
        shootStatus: "shot" as const,
        materialNotes: "龙头泡沫对比",
      },
    };
    let output = buildMockScriptOutput(request);
    output = {
      ...output,
      script: "模型擅自改写的短句",
      productionGuide: {
        shootStatus: "shot",
        editGuidance: ["旧"],
        materials: [{ section: "旧段", description: "按模型稿" }],
        storyboard: [],
      },
    };
    output = preferScriptBody(output, existing);
    output = finalizeScriptOutput(request, output);
    expect(output.script).toBe(existing);
    expect(
      output.productionGuide?.materials.some((item) =>
        item.description.includes("龙头泡沫对比"),
      ),
    ).toBe(true);
  });

  it("sanitizeScriptInput strips materialNotes unless shot", () => {
    expect(
      sanitizeScriptInput({
        idea: "选题",
        shootStatus: "unshot",
        materialNotes: "不该留下",
      }).materialNotes,
    ).toBeUndefined();
    expect(
      sanitizeScriptInput({
        idea: "选题",
        shootStatus: "shot",
        materialNotes: "应保留",
      }).materialNotes,
    ).toBe("应保留");
  });

  it("recordsOwnedBy filters references to owner imports only", () => {
    const records: ImportedVideoRecord[] = [
      {
        id: "mine",
        importId: "imp-a",
        spreadsheetRow: 1,
        platformVideoId: null,
        normalizedPlatformVideoId: null,
        description: "软水机安装案例",
        normalizedDescription: "软水机安装案例",
        publishedAt: "2026-01-01T00:00:00.000Z",
        completionRate: 0.4,
        averageWatchSeconds: 20,
        views: 500,
        recommendations: null,
        likes: 1,
        comments: 0,
        shares: 0,
        follows: 0,
        shareToChat: null,
        setAsRingtone: null,
        setAsStatus: null,
        setAsMomentsCover: null,
        wecomLinkClicks: null,
        wecomLinkUsers: null,
        contactAddCount: null,
        contactAddUsers: null,
      },
      {
        id: "theirs",
        importId: "imp-b",
        spreadsheetRow: 1,
        platformVideoId: null,
        normalizedPlatformVideoId: null,
        description: "软水机避坑指南",
        normalizedDescription: "软水机避坑指南",
        publishedAt: "2026-01-02T00:00:00.000Z",
        completionRate: 0.9,
        averageWatchSeconds: 40,
        views: 9999,
        recommendations: null,
        likes: 9,
        comments: 1,
        shares: 1,
        follows: 1,
        shareToChat: null,
        setAsRingtone: null,
        setAsStatus: null,
        setAsMomentsCover: null,
        wecomLinkClicks: null,
        wecomLinkUsers: null,
        contactAddCount: null,
        contactAddUsers: null,
      },
    ];
    const imports = [
      { id: "imp-a", ownerId: "owner-a" },
      { id: "imp-b", ownerId: "owner-b" },
    ];
    const owned = recordsOwnedBy(records, imports, "owner-a");
    expect(owned.map((item) => item.id)).toEqual(["mine"]);
    const refs = findScriptReferences(owned, "koubo", "water", "软水机");
    expect(refs.map((item) => item.videoRecordId)).toEqual(["mine"]);
  });

  it("detects plainText divergence from structured fields", () => {
    const output = buildMockScriptOutput({
      format: "koubo",
      topic: "water",
      subTopics: [],
      processKinds: [],
      input: { idea: "软水机离不开" },
    });
    expect(plainTextDivergesFromStructured(output)).toBe(false);
    expect(
      plainTextDivergesFromStructured({
        ...output,
        plainText: `${output.plainText}\n手工追加一行`,
      }),
    ).toBe(true);
    expect(outputToPlainText(output).length).toBeGreaterThan(0);
  });

  it("rejects productionGuide that violates shot XOR", () => {
    expect(() =>
      scriptDraftOutputSchema.parse({
        pipeline: "koubo",
        titles: ["标题"],
        tags: [],
        script: "口播",
        brollCues: [],
        subtitleBeats: [],
        altHooks: [],
        positioning: null,
        timeline: [],
        gapsOrWarnings: [],
        productionGuide: {
          shootStatus: "shot",
          editGuidance: ["建议"],
          materials: [{ section: "a", description: "b" }],
          storyboard: [
            {
              order: 1,
              shot: "不该有",
              camera: "近景",
              durationHint: "3秒",
              voiceCue: "开头",
            },
          ],
        },
        plainText: "口播",
      }),
    ).toThrow();
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
