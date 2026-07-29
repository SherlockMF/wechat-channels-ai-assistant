import { describe, expect, it } from "vitest";
import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import { buildRuleDiagnosis } from "@/lib/analysis/rules";
import { diagnosisToMarkdown } from "@/lib/analysis/markdown";
import { calculateAccountBaseline } from "@/lib/metrics/account";

const record: ImportedVideoRecord = {
  id: "video-1",
  importId: "import-1",
  spreadsheetRow: 2,
  platformVideoId: null,
  normalizedPlatformVideoId: null,
  description: "测试视频",
  normalizedDescription: "测试视频",
  publishedAt: "2026-07-29T00:00:00.000Z",
  completionRate: 0.1,
  averageWatchSeconds: 8,
  views: 100,
  recommendations: 0,
  likes: 2,
  comments: 1,
  shares: 1,
  follows: 0,
  shareToChat: 0,
  setAsRingtone: 0,
  setAsStatus: 0,
  setAsMomentsCover: 0,
  wecomLinkClicks: 0,
  wecomLinkUsers: 0,
  contactAddCount: 0,
  contactAddUsers: 0,
};

describe("运营报告可读性", () => {
  it("将诊断枚举转换为中文标签", () => {
    const result = buildRuleDiagnosis(
      record,
      calculateAccountBaseline([record]),
      30,
    );
    const markdown = diagnosisToMarkdown(
      record.description,
      record.publishedAt,
      result,
    );

    expect(markdown).toContain("开头钩子");
    expect(markdown).toContain("平均观看时长");
    expect(markdown).toContain("置信度：中");
    expect(markdown).not.toContain("average_watch_seconds");
    expect(markdown).not.toContain("置信度：medium");
  });
});
