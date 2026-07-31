import { describe, expect, it } from "vitest";
import type { DiagnosisResult, DraftReview } from "@video-diagnosis/shared-types";
import { buildVersionChangelog } from "@/lib/draft-review/changelog";
import {
  canAddDraftVersion,
  migrateDraftReviewVersions,
} from "@/lib/draft-review/versions";

function problem(
  category: DiagnosisResult["primaryProblems"][number]["category"],
  startSecond: number,
  endSecond: number,
  inference: string,
): DiagnosisResult["primaryProblems"][number] {
  return {
    category,
    severity: "medium",
    startSecond,
    endSecond,
    contentEvidence: ["e"],
    dataEvidence: [],
    inference,
    recommendation: "fix",
    expectedMetric: "completion_rate",
    confidence: "medium",
  };
}

function diagnosis(
  problems: DiagnosisResult["primaryProblems"],
): DiagnosisResult {
  return {
    executiveSummary: "summary",
    dataAssessment: {
      performanceLevel: "normal",
      sampleConfidence: "medium",
      facts: ["f"],
    },
    primaryProblems: problems,
    editingPlan: [],
    revisedOpening: [
      {
        startSecond: 0,
        endSecond: 1,
        visual: "v",
        voiceover: "vo",
        subtitle: "s",
        audio: "a",
        editingRhythm: "r",
        requiresReshoot: false,
      },
    ],
    hookAlternatives: [
      { type: "result", voiceover: "a", subtitle: "a", visual: "a" },
      { type: "pain_point", voiceover: "b", subtitle: "b", visual: "b" },
    ],
    copySuggestions: {
      cta: "c",
      originalSummary: "o",
      revisedFullScript: "s",
      subtitleVersion: "sub",
    },
    audioSuggestions: {
      currentIssues: [],
      musicMood: "calm",
      openingAudioAction: "keep",
      voiceMusicBalance: "voice forward",
      transitionSuggestions: [],
      avoid: [],
    },
    copyAndSubtitleReview: {
      copyRationality: "ok",
      copyProfessionalism: "ok",
      subtitleRationality: "ok",
      subtitleProfessionalism: "ok",
      issues: ["i"],
      revisionPoints: ["r"],
    },
    titleSuggestions: [
      {
        title: "t1",
        rationale: "r",
        expectedEffect: "e",
        basedOnSimilarTitles: [],
      },
      {
        title: "t2",
        rationale: "r",
        expectedEffect: "e",
        basedOnSimilarTitles: [],
      },
    ],
    limitations: ["l"],
  };
}

describe("buildVersionChangelog", () => {
  it("将消失的同类问题标为已改善，重叠的标为仍存在，新增的标为新问题", () => {
    const previous = diagnosis([
      problem("hook", 0, 3, "开头弱"),
      problem("subtitle", 10, 15, "字幕密"),
    ]);
    const next = diagnosis([
      problem("subtitle", 11, 16, "字幕仍密"),
      problem("pacing", 20, 28, "中段慢"),
    ]);

    const changelog = buildVersionChangelog(previous, next);

    expect(changelog.improved).toEqual([
      expect.objectContaining({ category: "hook", summary: expect.stringContaining("开头") }),
    ]);
    expect(changelog.remaining).toEqual([
      expect.objectContaining({ category: "subtitle" }),
    ]);
    expect(changelog.newIssues).toEqual([
      expect.objectContaining({ category: "pacing" }),
    ]);
  });

  it("无上一版问题时全部记为新问题", () => {
    const next = diagnosis([problem("hook", 0, 2, "弱钩子")]);
    const changelog = buildVersionChangelog(null, next);
    expect(changelog.improved).toEqual([]);
    expect(changelog.remaining).toEqual([]);
    expect(changelog.newIssues).toHaveLength(1);
  });
});

describe("migrateDraftReviewVersions", () => {
  it("为无版本的旧审片补 v1 并挂上结果", () => {
    const draft = {
      id: "d1",
      ownerId: "u1",
      title: "t",
      goal: null,
      tags: [],
      currentVersionId: null as string | null,
      versionCount: 0,
      originalFilename: "a.mp4",
      storagePath: "/tmp/a.mp4",
      mimeType: "video/mp4",
      fileSize: 1,
      durationSeconds: 10,
      width: null,
      height: null,
      fps: null,
      coverPath: null,
      coverSource: null,
      coverFrameSecond: null,
      evidencePath: null,
      baselineImportId: null,
      status: "completed" as const,
      progress: 100,
      currentStep: "completed",
      errorMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    } satisfies DraftReview;
    const state: {
      draftReviews: DraftReview[];
      draftReviewVersions: import("@video-diagnosis/shared-types").DraftReviewVersion[];
      draftResults: import("@video-diagnosis/shared-types").DraftReviewResult[];
    } = {
      draftReviews: [draft],
      draftReviewVersions: [],
      draftResults: [
        {
          id: "r1",
          draftReviewId: "d1",
          draftReviewVersionId: "",
          result: diagnosis([]),
          editedMarkdown: null,
          provider: "mock",
          changelog: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(migrateDraftReviewVersions(state)).toBe(true);
    expect(state.draftReviewVersions).toHaveLength(1);
    expect(state.draftReviews[0]?.currentVersionId).toBe(
      state.draftReviewVersions[0]?.id,
    );
    expect(state.draftResults[0]?.draftReviewVersionId).toBe(
      state.draftReviewVersions[0]?.id,
    );
  });
});

describe("canAddDraftVersion", () => {
  it("分析中与满 5 版时拒绝", () => {
    expect(canAddDraftVersion([], "processing").ok).toBe(false);
    const five = Array.from({ length: 5 }, (_, index) => ({
      id: `v${index}`,
      draftReviewId: "d1",
      versionNumber: index + 1,
      originalFilename: "a.mp4",
      storagePath: "/a",
      mimeType: "video/mp4",
      fileSize: 1,
      durationSeconds: null,
      width: null,
      height: null,
      fps: null,
      coverPath: null,
      coverSource: null,
      coverFrameSecond: null,
      evidencePath: null,
      status: "completed" as const,
      progress: 100,
      currentStep: "completed",
      errorMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    }));
    const blocked = canAddDraftVersion(five, "completed");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.status).toBe(422);
  });
});
