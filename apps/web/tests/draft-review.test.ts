import { describe, expect, it } from "vitest";
import { diagnosisResultSchema } from "@video-diagnosis/shared-types";
import { buildDraftDiagnosis } from "@/lib/draft-review/diagnosis";
import {
  selectEvidenceFrameSeconds,
  type DraftEvidenceManifest,
} from "@/lib/draft-review/evidence";
import { deduplicateAdjacentVisualFrames } from "@/lib/draft-review/visual-evidence";
import { normalizeDiagnosisTimeline } from "@/lib/draft-review/dashscope-provider";
import { parseTranscriptionSegments } from "@/lib/draft-review/speech-evidence";
import {
  findSimilarVideosByTags,
  normalizeDraftTags,
} from "@/lib/draft-review/similar-videos";
import { heuristicTagsFromTitle } from "@/lib/draft-review/suggest-tags";
import { calculateAccountBaseline } from "@/lib/metrics/account";
import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";

const evidence: DraftEvidenceManifest = {
  durationSeconds: 42,
  openingBoard: "opening.jpg",
  fullBoard: "full.jpg",
  combinedBoard: "combined.jpg",
  sceneCutSeconds: [0.5, 4.2, 12.8],
  silenceRanges: [{ start: 8, end: 9.2 }],
  title: "测试标题",
  goal: "引流咨询",
  tags: ["软水", "装修"],
  audioPath: "speech.wav",
  transcript: {
    text: "装修前先确认软水机位置，现场要预留电源和排水。结尾评论区领取清单。",
    provider: "test",
    model: "test-asr",
    language: "zh",
    segments: [
      { startSecond: 0, endSecond: 4, text: "装修前先确认软水机位置" },
    ],
  },
  frames: [
    {
      second: 0,
      imagePath: "frame-0.jpg",
      description: "施工现场展示软水机预留位置",
      ocrText: "装修前先确认",
      duplicateOfSecond: null,
    },
  ],
  limitations: [],
};

function makeRecord(
  id: string,
  description: string,
  completionRate: number,
): ImportedVideoRecord {
  return {
    id,
    importId: "i1",
    spreadsheetRow: 1,
    platformVideoId: null,
    normalizedPlatformVideoId: null,
    description,
    normalizedDescription: description,
    publishedAt: "2026-01-01T00:00:00.000Z",
    completionRate,
    averageWatchSeconds: 18,
    views: 1000,
    recommendations: null,
    likes: 20,
    comments: 5,
    shares: 3,
    follows: 2,
    shareToChat: null,
    setAsRingtone: null,
    setAsStatus: null,
    setAsMomentsCover: null,
    wecomLinkClicks: null,
    wecomLinkUsers: null,
    contactAddCount: null,
    contactAddUsers: null,
  };
}

const sampleRecord = makeRecord("r1", "样例", 0.2);

describe("buildDraftDiagnosis", () => {
  it("无基线时仍生成完整结构化诊断", () => {
    const result = buildDraftDiagnosis(evidence, null);
    expect(result.executiveSummary.length).toBeGreaterThan(0);
    expect(result.primaryProblems).toHaveLength(3);
    expect(result.copyAndSubtitleReview.issues.length).toBeGreaterThan(0);
    expect(result.titleSuggestions.length).toBeGreaterThanOrEqual(2);
    expect(result.detailedObservations?.length).toBeGreaterThanOrEqual(3);
    expect(result.publishChecklist?.length).toBeGreaterThan(0);
    expect(result.scriptAlignment?.openingPromise.status).toBe("not_available");
    expect(result.limitations.some((item) => item.includes("无账号基线"))).toBe(true);
    expect(() => diagnosisResultSchema.parse(result)).not.toThrow();
  });

  it("有基线时写入历史表现事实", () => {
    const baseline = calculateAccountBaseline([sampleRecord, sampleRecord]);
    const result = buildDraftDiagnosis(evidence, baseline);
    expect(
      result.dataAssessment.facts.some((fact) => fact.includes("近 10 条")),
    ).toBe(true);
  });

  it("相似历史视频会进入标题建议依据", () => {
    const similar = findSimilarVideosByTags(
      [
        makeRecord("a", "软水机装修避坑必看", 0.35),
        makeRecord("b", "全屋净水怎么选", 0.22),
      ],
      { tags: ["软水", "装修"], title: "软水装修后悔" },
    );
    const result = buildDraftDiagnosis(evidence, null, similar);
    expect(result.titleSuggestions[0]?.basedOnSimilarTitles.length).toBeGreaterThan(0);
    expect(
      result.dataAssessment.facts.some((fact) => fact.includes("最相似历史条")),
    ).toBe(true);
  });
});

describe("evidence sampling", () => {
  it("加密覆盖前三秒并在之后每 5 秒取帧，最多 36 张", () => {
    expect(selectEvidenceFrameSeconds(40)).toEqual([
      0,
      1,
      2,
      3,
      5,
      7,
      10,
      15,
      20,
      25,
      30,
      35,
    ]);
    expect(selectEvidenceFrameSeconds(2.5)).toEqual([0, 1, 2]);
    expect(selectEvidenceFrameSeconds(10_000)).toHaveLength(36);
  });

  it("相邻画面描述和 OCR 高度相似时标记重复", () => {
    const frames = deduplicateAdjacentVisualFrames([
      {
        second: 0,
        imagePath: "0.jpg",
        description: "施工现场展示软水机安装位置",
        ocrText: "装修前先预留",
        duplicateOfSecond: null,
      },
      {
        second: 1,
        imagePath: "1.jpg",
        description: "施工现场展示软水机安装位置",
        ocrText: "装修前先预留",
        duplicateOfSecond: null,
      },
      {
        second: 2,
        imagePath: "2.jpg",
        description: "镜头切到排水管特写",
        ocrText: "排水要求",
        duplicateOfSecond: null,
      },
    ]);
    expect(frames[1]?.duplicateOfSecond).toBe(0);
    expect(frames[2]?.duplicateOfSecond).toBeNull();
  });
});

describe("provider timeline guard", () => {
  it("裁剪模型越界秒点并过滤裁剪后无有效区间的项", () => {
    const raw = structuredClone(buildDraftDiagnosis(evidence, null));
    raw.primaryProblems[0]!.startSecond = -8;
    raw.primaryProblems[0]!.endSecond = 999;
    raw.primaryProblems[1]!.startSecond = 80;
    raw.primaryProblems[1]!.endSecond = 90;
    raw.editingPlan[0]!.startSecond = -2;
    raw.editingPlan[0]!.endSecond = 99;
    raw.editingPlan[0]!.sourceAsset = {
      sourceStartSecond: 80,
      sourceEndSecond: 99,
    };
    raw.revisedOpening[0]!.sourceAssetStartSecond = -5;
    raw.revisedOpening[0]!.sourceAssetEndSecond = 100;
    raw.detailedObservations![0]!.endSecond = 100;

    const parsed = diagnosisResultSchema.parse(
      normalizeDiagnosisTimeline(raw, 42),
    );
    expect(parsed.primaryProblems[0]).toMatchObject({
      startSecond: 0,
      endSecond: 42,
    });
    expect(parsed.primaryProblems).toHaveLength(2);
    expect(parsed.editingPlan[0]).toMatchObject({
      startSecond: 0,
      endSecond: 42,
    });
    expect(parsed.editingPlan[0]?.sourceAsset).toBeUndefined();
    expect(parsed.revisedOpening[0]).toMatchObject({
      sourceAssetStartSecond: 0,
      sourceAssetEndSecond: 42,
    });
    expect(parsed.detailedObservations?.[0]?.endSecond).toBe(42);
  });
});

describe("speech evidence", () => {
  it("解析 verbose_json 句级时间码并裁剪到媒体时长", () => {
    expect(
      parseTranscriptionSegments(
        {
          segments: [
            { start: -1, end: 2.5, text: "开头" },
            { start: 8, end: 15, text: "结尾" },
            { start: 11, end: 12, text: "超出媒体" },
          ],
        },
        10,
      ),
    ).toEqual([
      { startSecond: 0, endSecond: 2.5, text: "开头" },
      { startSecond: 8, endSecond: 10, text: "结尾" },
    ]);
  });
});

describe("heuristicTagsFromTitle", () => {
  it("从分隔标题切出标签", () => {
    expect(heuristicTagsFromTitle("软水_装修避坑_必看")).toEqual(
      expect.arrayContaining(["软水", "装修避坑"]),
    );
  });
});

describe("normalizeDraftTags / findSimilarVideosByTags", () => {
  it("解析逗号分隔标签", () => {
    expect(normalizeDraftTags("软水，装修避坑、净水")).toEqual([
      "软水",
      "装修避坑",
      "净水",
    ]);
  });

  it("按标签命中排序相似视频", () => {
    const similar = findSimilarVideosByTags(
      [
        makeRecord("a", "今日运势分享", 0.4),
        makeRecord("b", "软水机安装避坑", 0.3),
        makeRecord("c", "软水+装修最后悔的事", 0.28),
      ],
      { tags: ["软水", "装修"] },
    );
    expect(similar[0]?.description).toContain("软水");
    expect(similar.some((item) => item.description.includes("运势"))).toBe(false);
  });
});
