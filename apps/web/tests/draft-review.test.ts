import { describe, expect, it } from "vitest";
import { diagnosisResultSchema } from "@video-diagnosis/shared-types";
import { buildDraftDiagnosis } from "@/lib/draft-review/diagnosis";
import type { DraftEvidenceManifest } from "@/lib/draft-review/evidence";
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
