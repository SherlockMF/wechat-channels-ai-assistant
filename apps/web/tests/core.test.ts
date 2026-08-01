import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { diagnosisResultSchema } from "@video-diagnosis/shared-types";
import type {
  ImportedVideoRecord,
  VideoAsset,
} from "@video-diagnosis/shared-types";
import {
  excelSerialToDate,
  parseNullableNumber,
  parsePercentage,
  parseWorkbook,
  validateWorkbookFile,
} from "@/lib/imports/parser";
import { normalizeTitle } from "@/lib/imports/normalize";
import {
  combinedSimilarity,
  matchAsset,
} from "@/lib/matching/similarity";
import {
  calculateAccountBaseline,
  safeRate,
  sortByPublishedAt,
} from "@/lib/metrics/account";
import { buildRuleDiagnosis } from "@/lib/analysis/rules";
import { selectPreferredAnalysisJob } from "@/lib/data/job-selection";
import type { AnalysisJob } from "@/lib/data/types";
import {
  buildLocalSourceState,
  readLocalSourceFingerprint,
} from "@/lib/data/local-source";

const headers = [
  "视频描述",
  "视频ID",
  "发布时间",
  "完播率",
  "平均播放时长",
  "播放量",
  "推荐",
  "喜欢",
  "评论量",
  "分享量",
  "关注量",
  "转发聊天和朋友圈",
  "设为铃声",
  "设为状态",
  "设为朋友圈封面",
  "企微链接点击次数",
  "企微链接点击人数",
  "添加到通讯录次数",
  "添加到通讯录人数",
];

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([headers, ...rows]),
    "视频号数据明细",
  );
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return output as ArrayBuffer;
}

function row(
  description: string,
  id: string,
  publishedAt: number | string = 45292,
): unknown[] {
  return [
    description,
    id,
    publishedAt,
    "9.45%",
    10.2,
    100,
    null,
    5,
    1,
    2,
    0,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];
}

function record(
  id: string,
  description: string,
  publishedAt: string,
  spreadsheetRow: number,
): ImportedVideoRecord {
  return {
    id,
    importId: "import",
    spreadsheetRow,
    platformVideoId: `export/${id}`,
    normalizedPlatformVideoId: id,
    description,
    normalizedDescription: normalizeTitle(description),
    publishedAt,
    completionRate: 0.1,
    averageWatchSeconds: 10,
    views: 100,
    recommendations: null,
    likes: 5,
    comments: 1,
    shares: 2,
    follows: 1,
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

describe("Excel 导入", () => {
  it("拒绝空文件和伪装扩展名，限制易受攻击解析器的输入面", () => {
    expect(() => validateWorkbookFile(new File([], "empty.xlsx"))).toThrow(
      "Excel 文件大小",
    );
    expect(() => validateWorkbookFile(new File(["x"], "payload.txt"))).toThrow(
      "仅支持",
    );
  });

  it("转换 Excel 日期序列号", () => {
    expect(excelSerialToDate(45292).toISOString().slice(0, 10)).toBe("2024-01-01");
  });

  it("统一百分比格式", () => {
    expect(parsePercentage("9.45%")).toBeCloseTo(0.0945);
    expect(parsePercentage(9.45)).toBeCloseTo(0.0945);
    expect(parsePercentage(0.0945)).toBeCloseTo(0.0945);
  });

  it("空值不会转换为 0", () => {
    expect(parseNullableNumber(null)).toBeNull();
    expect(parseNullableNumber("  ")).toBeNull();
    expect(parsePercentage("")).toBeNull();
  });

  it("同一视频ID去重并报告原始行号", () => {
    const preview = parseWorkbook(
      workbookBuffer([
        row("第一条", "export/duplicate-id-1234567890"),
        row("第二条", "export/duplicate-id-1234567890"),
      ]),
    );
    expect(preview.records).toHaveLength(1);
    expect(preview.duplicateRows).toEqual([3]);
    expect(preview.errors[0]).toMatchObject({ row: 3, field: "视频ID" });
  });
});

describe("真实本地数据源", () => {
  it("直接读取已匹配工作簿和视频目录，不复制源文件", async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "video-diagnosis-source-"),
    );
    const workbookPath = path.join(temporaryRoot, "matched.xlsx");
    const videoDirectory = path.join(temporaryRoot, "videoes");
    await fs.mkdir(videoDirectory);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["视频名称", ...headers],
        ["真实视频.mp4", ...row("真实视频标题", "export/real-video-id-1234567890")],
      ]),
      "视频号数据明细",
    );
    XLSX.writeFile(workbook, workbookPath);
    await fs.writeFile(path.join(videoDirectory, "真实视频.mp4"), "video");
    await fs.writeFile(path.join(videoDirectory, "未关联视频.mp4"), "video");
    const previousWorkbook = process.env.LOCAL_SOURCE_WORKBOOK;
    const previousVideoDirectory = process.env.LOCAL_VIDEO_DIRECTORY;
    process.env.LOCAL_SOURCE_WORKBOOK = workbookPath;
    process.env.LOCAL_VIDEO_DIRECTORY = videoDirectory;
    try {
      const snapshot = await buildLocalSourceState();
      expect(snapshot.state.records).toHaveLength(1);
      expect(snapshot.state.assets).toHaveLength(2);
      expect(snapshot.matchedRelationshipCount).toBe(1);
      expect(snapshot.unmatchedAssetCount).toBe(1);
      await fs.writeFile(path.join(videoDirectory, "新增视频.mp4"), "video");
      expect(await readLocalSourceFingerprint()).not.toBe(
        snapshot.fingerprint,
      );
      expect(snapshot.state.assets[0]?.storagePath.startsWith(videoDirectory)).toBe(
        true,
      );
    } finally {
      if (previousWorkbook === undefined) delete process.env.LOCAL_SOURCE_WORKBOOK;
      else process.env.LOCAL_SOURCE_WORKBOOK = previousWorkbook;
      if (previousVideoDirectory === undefined)
        delete process.env.LOCAL_VIDEO_DIRECTORY;
      else process.env.LOCAL_VIDEO_DIRECTORY = previousVideoDirectory;
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe("标题标准化与匹配", () => {
  it("标准化中文标题并删除 emoji、话题和版本后缀", () => {
    expect(
      normalizeTitle("01.【测试】智能门锁😎 #全屋智能 #装修_最终版.mp4"),
    ).toBe("测试智能门锁");
  });

  it("单独移除 emoji 与连续话题标签", () => {
    expect(normalizeTitle("净水器怎么选😭#全屋净水#水健康")).toBe(
      "净水器怎么选",
    );
  });

  it("相似标题达到自动匹配阈值", () => {
    const score = combinedSimilarity(
      "全屋净水必看_最终版.mp4",
      "全屋净水必看！#全屋净水",
    );
    expect(score).toBeGreaterThanOrEqual(0.88);
  });

  it("多个接近候选必须进入人工确认", () => {
    const asset: VideoAsset = {
      id: "asset",
      importId: "import",
      originalFilename: "智能门锁安装避坑.mp4",
      normalizedFilename: "智能门锁安装避坑",
      storagePath: "private",
      mimeType: "video/mp4",
      fileSize: 10,
      lastModifiedAt: null,
      durationSeconds: 20,
      width: 1080,
      height: 1920,
      fps: 30,
      processingStatus: "uploaded",
      coverPath: null,
      coverSource: null,
      coverFrameSecond: null,
    };
    const match = matchAsset(asset, [
      record("a", "智能门锁安装避坑指南", "2026-01-01T00:00:00.000Z", 2),
      record("b", "智能门锁安装避坑清单", "2026-01-02T00:00:00.000Z", 3),
    ]);
    expect(match.status).toBe("needs_review");
    expect(match.videoRecordId).toBeNull();
  });
});

describe("排序、指标与诊断约束", () => {
  const records = [
    record("a", "A", "2026-01-01T00:00:00.000Z", 4),
    record("b", "B", "2026-01-03T00:00:00.000Z", 5),
    record("c", "C", "2026-01-03T00:00:00.000Z", 2),
  ];

  it("同一视频优先使用已完成的 Codex 多模态结果", () => {
    const baseJob: AnalysisJob = {
      id: "local-job",
      ownerId: "owner",
      videoRecordId: "video",
      videoAssetId: "asset",
      status: "completed",
      progress: 100,
      currentStep: "local_rule_completed",
      retryCount: 0,
      errorCode: null,
      errorMessage: null,
      startedAt: "2026-01-03T00:00:00.000Z",
      completedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-03T00:00:00.000Z",
    };
    const codexJob: AnalysisJob = {
      ...baseJob,
      id: "codex-job",
      currentStep: "codex_multimodal_completed",
      createdAt: "2026-01-02T00:00:00.000Z",
    };

    expect(
      selectPreferredAnalysisJob([codexJob, baseJob], "video")?.id,
    ).toBe("codex-job");
    expect(selectPreferredAnalysisJob([baseJob], "other")).toBeNull();
  });
  it("发布时间降序且同时间按 Excel 行号升序", () => {
    expect(sortByPublishedAt(records).map((item) => item.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("views 为 0 时互动率为 NULL", () => {
    expect(safeRate(1, 0)).toBeNull();
    expect(safeRate(1, null)).toBeNull();
  });

  it("AI 结果通过严格 JSON Schema", () => {
    const baseline = calculateAccountBaseline(records);
    const result = buildRuleDiagnosis(records[0]!, baseline, 30);
    expect(diagnosisResultSchema.parse(result)).toEqual(result);
  });

  it("没有逐秒留存时不生成确定性流失结论", () => {
    const baseline = calculateAccountBaseline(records);
    const result = buildRuleDiagnosis(records[0]!, baseline, 30);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("用户在第");
    expect(serialized).not.toContain("大量流失");
    expect(result.limitations.join("")).toContain("没有逐秒留存");
  });
});
