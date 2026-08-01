import type {
  DiagnosisResult,
  ImportedVideoRecord,
} from "@video-diagnosis/shared-types";
import type { AccountBaseline } from "@/lib/metrics/account";
import { safeRate, sampleConfidence } from "@/lib/metrics/account";
import type { SimilarVideoSummary } from "@/lib/draft-review/similar-videos";

function percent(value: number | null): string {
  return value === null ? "暂无" : `${(value * 100).toFixed(2)}%`;
}

function comparisonFact(
  label: string,
  value: number | null,
  median: number | null,
  formatter: (input: number | null) => string = percent,
): string {
  if (value === null || median === null) return `${label}数据不足，暂不比较。`;
  const direction = value >= median ? "高于或等于" : "低于";
  return `${label}为 ${formatter(value)}，${direction}账号中位数 ${formatter(median)}。`;
}

export function buildRuleDiagnosis(
  record: ImportedVideoRecord,
  baseline: AccountBaseline,
  durationSeconds: number | null,
  similarVideos: SimilarVideoSummary[] = [],
): DiagnosisResult {
  const confidence = sampleConfidence(record.views, baseline);
  const facts = [
    comparisonFact(
      "完播率",
      record.completionRate,
      baseline.all.completionRate?.q2 ?? null,
    ),
    comparisonFact(
      "平均播放时长",
      record.averageWatchSeconds,
      baseline.all.averageWatchSeconds?.q2 ?? null,
      (value) => (value === null ? "暂无" : `${value.toFixed(1)} 秒`),
    ),
    `点赞率 ${percent(safeRate(record.likes, record.views))}，分享率 ${percent(
      safeRate(record.shares, record.views),
    )}，关注转化率 ${percent(safeRate(record.follows, record.views))}。`,
  ];
  const weakCompletion =
    record.completionRate !== null &&
    baseline.all.completionRate?.q2 !== null &&
    baseline.all.completionRate?.q2 !== undefined &&
    record.completionRate < baseline.all.completionRate.q2;
  const duration = durationSeconds ?? Math.max(10, record.averageWatchSeconds ?? 30);
  const sourceTitle = record.description.trim() || "这条视频";
  const similarTitles = similarVideos
    .map((item) => item.description.trim())
    .filter(Boolean)
    .slice(0, 3);
  const referenceRationale = similarTitles.length
    ? `参考 ${similarTitles.length} 条标题相近的历史视频，`
    : "未找到足够相似的历史视频，仅根据当前标题结构";
  const windows = [
    [0, Math.min(3, duration)],
    [Math.min(3, duration), Math.min(8, duration)],
    [Math.max(0, duration - Math.min(6, duration)), duration],
  ] as const;

  return {
    executiveSummary: weakCompletion
      ? "整体指标显示观看承接偏弱，先压缩开头信息路径，再检查中段重复和结尾动作。"
      : "整体表现接近账号常态，建议用更快的主题进入和更明确的结果画面争取增量。",
    dataAssessment: {
      performanceLevel: weakCompletion ? "low" : "normal",
      sampleConfidence: confidence,
      facts,
    },
    primaryProblems: [
      {
        category: "hook",
        severity: "high",
        startSecond: windows[0][0],
        endSecond: windows[0][1],
        contentEvidence: ["当前仅完成规则诊断，需结合关键帧确认首屏主题是否明确。"],
        dataEvidence: [facts[0] ?? ""],
        inference:
          "开头信息密度可能不足；这是基于整体指标的疑似问题，不代表真实流失发生在该时段。",
        recommendation:
          "将最明确的结果或痛点画面放到 0～1 秒，并在 3 秒内说清对象与收益。",
        expectedMetric: "completion_rate",
        confidence,
      },
      {
        category: "pacing",
        severity: "medium",
        startSecond: windows[1][0],
        endSecond: windows[1][1],
        contentEvidence: ["该区间需由转写和镜头切分继续核验是否存在重复铺垫。"],
        dataEvidence: [facts[1] ?? ""],
        inference:
          "平均播放时长与整体完播表现提示中前段可能需要缩短表达路径。",
        recommendation: "逐句检查同义重复，保留一个证据点，其余用跳切或字幕合并。",
        expectedMetric: "average_watch_seconds",
        confidence: "low",
      },
      {
        category: "structure",
        severity: "medium",
        startSecond: windows[2][0],
        endSecond: windows[2][1],
        contentEvidence: ["结尾是否拖沓需结合完整时间轴确认。"],
        dataEvidence: [facts[2] ?? ""],
        inference: "互动与转化动作可能没有形成单一、清晰的下一步。",
        recommendation: "结尾只保留一个 CTA，并在最后 2 秒用大字字幕强化。",
        expectedMetric: "follow_rate",
        confidence: "low",
      },
    ],
    editingPlan: [
      {
        startSecond: 0,
        endSecond: Math.min(3, duration),
        originalContent: "原视频开头",
        problem: "主题与收益可能进入偏慢，需要关键帧复核。",
        action: "replace",
        replacementContent: "首帧直接展示结果，并用一句话说明用户能获得什么。",
        requiresReshoot: true,
      },
      {
        startSecond: windows[1][0],
        endSecond: windows[1][1],
        originalContent: "中前段表达",
        problem: "可能存在可压缩的铺垫或同义重复。",
        action: "trim",
        replacementContent: "保留核心证据，删除不增加信息的停顿和重复句。",
        requiresReshoot: false,
      },
      {
        startSecond: windows[2][0],
        endSecond: windows[2][1],
        originalContent: "结尾",
        problem: "CTA 可能不够单一。",
        action: "add_subtitle",
        replacementContent: "用一个明确动作收束，例如“收藏这份清单”。",
        requiresReshoot: false,
      },
    ],
    revisedOpening: [
      {
        startSecond: 0,
        endSecond: 1,
        visual: "结果画面或最强对比画面；原片无合适素材时补拍。",
        voiceover: "先说最具体的痛点或结果。",
        subtitle: "一句话利益点",
        audio: "口播首字即入，背景音乐压低至不遮挡人声。",
        editingRhythm: "首帧强信息，1 秒内完成第一次视觉变化。",
        requiresReshoot: true,
      },
      {
        startSecond: 1,
        endSecond: 3,
        visual: "产品、施工或使用动作的近景证据。",
        voiceover: "说明为什么这件事与目标用户有关。",
        subtitle: "对象 + 场景",
        audio: "保留清晰环境动作声。",
        editingRhythm: "1～1.5 秒一切，避免空镜。",
        requiresReshoot: true,
      },
      {
        startSecond: 3,
        endSecond: 10,
        visual: "用 2～3 个镜头快速给出方法和证据。",
        voiceover: "给出方法、证据和继续观看的理由。",
        subtitle: "方法 1 / 证据 / 结果",
        audio: "节奏稳定，口播优先。",
        editingRhythm: "证据点同步换镜，10 秒前完成第一轮价值交付。",
        requiresReshoot: true,
      },
    ],
    hookAlternatives: [
      {
        type: "result",
        voiceover: "先看结果：这个改动解决了最影响体验的问题。",
        subtitle: "结果先给你看",
        visual: "结果画面近景。",
      },
      {
        type: "pain_point",
        voiceover: "如果你也遇到这个问题，先别急着花冤枉钱。",
        subtitle: "先避开这个坑",
        visual: "问题场景与人物反应。",
      },
      {
        type: "suspense",
        voiceover: "大多数人忽略的，其实是这一步。",
        subtitle: "关键不是你以为的那个",
        visual: "局部细节特写后快速揭示全景。",
      },
    ],
    copySuggestions: {
      originalSummary: record.description,
      revisedFullScript:
        "结果或痛点先行；3 秒内说明对象与收益；主张必须可验证；专有名词后跟白话；随后给出方法和证据；结尾只保留一个行动指令。",
      subtitleVersion: "结果先行｜适用场景｜核心方法｜证据｜单一 CTA",
      cta: "收藏这份清单，准备装修时逐项核对。",
    },
    copyAndSubtitleReview: {
      copyRationality: weakCompletion
        ? "完播偏低时，优先怀疑开场承诺落空、逻辑跳跃或中段空泛铺垫，而非单纯时长问题。"
        : "口播主张需与标题一致，并可用画面/数据佐证；避免因果倒置与无法举证的绝对化结论。",
      copyProfessionalism:
        "术语克制使用：必要专业词保留并立即白话解释；删除口号堆砌、夸大疗效与空话套话。",
      subtitleRationality:
        "字幕应与口播同义对齐；数字、对比结论、适用边界优先上屏，口语填充词不上屏。",
      subtitleProfessionalism:
        "短句分行、每屏信息密度适中；错别字、标点混乱与全文粘贴口播会直接损害专业感。",
      issues: [
        "需人工核对标题与首句口播是否兑现同一承诺。",
        "需检查是否存在无法举证的绝对化用语（最好/一定/立刻见效等）。",
        "需检查字幕是否过长、漏关键数字，或与口播冲突。",
      ],
      revisionPoints: [
        "开场 3 秒内给出可验证结果或痛点，并与标题一致。",
        "每段只保留一个主张 + 一个证据；专有名词后加白话。",
        "字幕每屏控制短句，结尾只留一个 CTA。",
      ],
    },
    titleSuggestions: [
      {
        title: `${sourceTitle.replace(/[！!？?。．.…]+$/u, "")}｜3 秒说清收益`,
        rationale: `${referenceRationale}补齐对象与收益，降低点击后落差。`,
        expectedEffect: "提高首屏承诺一致性，利于完播开局。",
        basedOnSimilarTitles: similarTitles,
      },
      {
        title: `别再忽略这一点：${sourceTitle.slice(0, 18)}`,
        rationale: `${referenceRationale}改写为痛点句式，缩短理解路径。`,
        expectedEffect: "强化问题共鸣，缩短理解成本。",
        basedOnSimilarTitles: similarTitles,
      },
      {
        title: `${sourceTitle.slice(0, 16)}｜只保留一个行动指令`,
        rationale: `${referenceRationale}收窄信息并突出可执行动作。`,
        expectedEffect: "利于关注/私信等单一目标转化。",
        basedOnSimilarTitles: similarTitles,
      },
    ],
    audioSuggestions: {
      currentIssues: ["尚未完成真实音轨分析，不能判断具体静音或削波区间。"],
      musicMood: "克制、清晰、有轻微推进感",
      bpmRange: "90–110 BPM",
      openingAudioAction: "首字即入，前 0.3 秒不留无意义静音。",
      voiceMusicBalance: "人声为主，BGM 比人声低约 12–18 dB。",
      transitionSuggestions: ["只在信息层级变化处使用轻量转场音。"],
      avoid: ["未经确认的版权歌曲", "高频音效堆叠", "BGM 遮挡口播"],
    },
    limitations: [
      "当前没有逐秒留存数据，不能定位真实流失秒数。",
      "规则诊断不等同于因果结论，时间段需要结合转写、关键帧和人工复核。",
      "文案与字幕的合理性、专业性评估为结构化启发，发布前仍需人工终审。",
      "修改后效果需通过新视频数据验证，系统不承诺指标一定提升。",
    ],
  };
}
