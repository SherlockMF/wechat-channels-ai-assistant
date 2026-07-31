import type { DiagnosisResult } from "@video-diagnosis/shared-types";
import type { AccountBaseline } from "@/lib/metrics/account";
import type { DraftEvidenceManifest } from "@/lib/draft-review/evidence";
import type { SimilarVideoSummary } from "@/lib/draft-review/similar-videos";

function percent(value: number | null): string {
  return value === null ? "暂无" : `${(value * 100).toFixed(1)}%`;
}

function buildTitleSuggestions(
  evidence: DraftEvidenceManifest,
  similar: SimilarVideoSummary[],
): DiagnosisResult["titleSuggestions"] {
  const tags = evidence.tags ?? [];
  const tagLabel = tags.length > 0 ? tags.slice(0, 2).join("·") : "主题";
  const topTitles = similar.slice(0, 3).map((item) => item.description);
  const top = similar[0];
  const performanceHint = top
    ? `参照「${top.description.slice(0, 24)}」等历史条（完播 ${percent(top.completionRate)}）`
    : "暂无足够相似历史条，按标签与目标改写";

  return [
    {
      title: evidence.title
        ? `${evidence.title.replace(/[！!？?。．.]+$/u, "")}｜${tagLabel}必看`
        : `${tagLabel}：3 秒说清你最该避开的坑`,
      rationale: `${performanceHint}；保留承诺，补具体对象与场景。`,
      expectedEffect: "提高点击期待与首屏承诺一致性，利于完播开局。",
      basedOnSimilarTitles: topTitles,
    },
    {
      title: evidence.goal
        ? `${tagLabel}这样做，${evidence.goal}更快`
        : `别再这样拍${tagLabel}：结果差在前 3 秒`,
      rationale: "痛点/结果句式在历史高完播标题中更常见，便于对照改写。",
      expectedEffect: "强化问题共鸣，缩短理解成本。",
      basedOnSimilarTitles: topTitles.slice(0, 2),
    },
    {
      title: top
        ? `${top.description.slice(0, 18).replace(/[…．.]+$/u, "")}｜本条更具体的做法`
        : `${tagLabel}清单：只保留一个行动指令`,
      rationale: "在相似标题骨架上收窄信息，避免空泛形容词。",
      expectedEffect: "提升专业感与可执行期待，利于关注/私信转化。",
      basedOnSimilarTitles: topTitles.slice(0, 2),
    },
  ];
}

export function buildDraftDiagnosis(
  evidence: DraftEvidenceManifest,
  baseline: AccountBaseline | null,
  similarVideos: SimilarVideoSummary[] = [],
): DiagnosisResult {
  const duration = evidence.durationSeconds;
  const hasBaseline = baseline !== null && baseline.all.completionRate?.q2 !== undefined;
  const recentCompletion = baseline?.recent10.completionRate ?? null;
  const recentWatch = baseline?.recent10.averageWatchSeconds ?? null;
  const tags = evidence.tags ?? [];
  const titleLine = evidence.title
    ? `标题「${evidence.title}」将作为首屏承诺对照。`
    : "未填写标题，建议补充一句明确承诺后再发布。";
  const goalLine = evidence.goal
    ? `发布目标：${evidence.goal}。`
    : "未填写发布目标，建议明确本条视频要完成的动作（涨粉/引流/讲产品）。";
  const tagLine =
    tags.length > 0
      ? `视频标签：${tags.join("、")}；已检索 ${similarVideos.length} 条历史相似视频用于标题建议。`
      : "未填写视频标签，标题建议主要依据当前标题/目标改写，相似历史对照较弱。";

  const facts = [
    `视频时长 ${duration.toFixed(1)} 秒，检测到 ${evidence.sceneCutSeconds.length} 处镜头切换。`,
    titleLine,
    goalLine,
    tagLine,
  ];
  if (hasBaseline && baseline) {
    facts.push(
      `账号近 10 条中位完播率 ${percent(recentCompletion)}，中位平均观看 ${recentWatch === null ? "暂无" : `${recentWatch.toFixed(1)} 秒`}。`,
    );
  } else {
    facts.push("暂无账号基线数据，以下建议仅基于内容结构与时长启发，不含历史表现对照。");
  }
  if (similarVideos[0]) {
    const top = similarVideos[0];
    facts.push(
      `最相似历史条「${top.description}」：完播 ${percent(top.completionRate)}，均看 ${
        top.averageWatchSeconds === null ? "暂无" : `${top.averageWatchSeconds.toFixed(1)} 秒`
      }，播放 ${top.views ?? "暂无"}。`,
    );
  }

  const hookEnd = Math.min(3, duration);
  const midStart = Math.min(3, duration);
  const midEnd = Math.min(8, duration);
  const tailStart = Math.max(0, duration - Math.min(6, duration));
  const openingSlow =
    evidence.sceneCutSeconds.filter((second) => second <= 3).length <= 1;

  return {
    executiveSummary: openingSlow
      ? "开头镜头变化偏少，主题进入可能偏慢；建议先把最强结果或痛点画面放到首秒，并同步检查口播/字幕是否合理、专业，再按标签对照历史标题择优发布。"
      : "镜头节奏已有基础变化；请对照标题承诺检查前 3 秒是否兑现，并复核文案与字幕的合理性、专业性，结合相似历史标题给出更可点开的标题。",
    dataAssessment: {
      performanceLevel: hasBaseline ? "normal" : "normal",
      sampleConfidence: hasBaseline ? "medium" : "low",
      facts,
    },
    primaryProblems: [
      {
        category: "hook",
        severity: "high",
        startSecond: 0,
        endSecond: hookEnd,
        contentEvidence: [
          openingSlow
            ? "前 3 秒镜头切换较少，首屏信息密度可能不足。"
            : "前 3 秒已有镜头变化，需人工对照关键帧确认主题是否清晰。",
          evidence.combinedBoard
            ? "已生成开头与全片分镜板，请结合画面复核首屏承诺。"
            : "证据包已生成，请结合关键帧复核首屏。",
        ],
        dataEvidence: hasBaseline
          ? [`账号近 10 条中位完播 ${percent(recentCompletion)}，开头承接决定能否达到该水平。`]
          : ["无历史表现数据，需完全依赖画面与口播判断。"],
        inference:
          "开头可能在解释背景而非直接兑现标题/目标；这是疑似问题区间，不代表真实流失秒数。",
        recommendation:
          "0～1 秒给出最强结果或痛点画面，3 秒内用字幕说清对象与收益。",
        expectedMetric: "completion_rate",
        confidence: hasBaseline ? "medium" : "low",
      },
      {
        category: "copy",
        severity: "high",
        startSecond: 0,
        endSecond: Math.min(duration, Math.max(hookEnd, midEnd)),
        contentEvidence: [
          "口播需同时满足：事实可核对、承诺不过度、术语对受众可懂。",
          evidence.title
            ? `当前标题「${evidence.title}」应与口播首句一致，避免标题党后落空。`
            : "缺少标题承诺时，口播更容易空泛开场。",
        ],
        dataEvidence: similarVideos.length
          ? [
              `已对照 ${similarVideos.length} 条标签相近历史视频的标题与完播/观看表现，口播应向高表现条的信息密度靠拢。`,
            ]
          : ["相似历史样本不足，口播专业性主要依赖内容侧规范检查。"],
        inference:
          "文案若出现夸大、逻辑跳跃或行业黑话堆砌，会同时伤害完播与专业信任。",
        recommendation:
          "每段口播只保留一个可验证主张；删掉无法举证的绝对化用语，专有名词后紧跟白话解释。",
        expectedMetric: "average_watch_seconds",
        confidence: similarVideos.length > 0 ? "medium" : "low",
      },
      {
        category: "subtitle",
        severity: "medium",
        startSecond: 0,
        endSecond: duration,
        contentEvidence: [
          "字幕应短句分行、关键词加粗感（大字），并与口播同义而非机械全文粘贴。",
          "专业名词、数字、对比结论优先上字幕，避免口语填充词上屏。",
        ],
        dataEvidence: evidence.goal
          ? [`发布目标「${evidence.goal}」应在结尾字幕以单一 CTA 收束。`]
          : ["未指定目标时，结尾字幕容易变成空泛总结。"],
        inference:
          "字幕不合理（过长、错别字、与口播冲突）会直接降低专业感与信息吸收效率。",
        recommendation:
          "每屏不超过 14 字；数字与结论单独一行；删语气词；结尾只留一个行动指令。",
        expectedMetric: "completion_rate",
        confidence: "low",
      },
    ],
    editingPlan: [
      {
        startSecond: 0,
        endSecond: hookEnd,
        originalContent: "原视频开头",
        problem: openingSlow ? "首屏镜头单一，主题进入偏慢。" : "首屏需对照标题承诺复核。",
        action: "replace",
        replacementContent: "首帧展示最强结果或痛点，并配一句可验证的口播/字幕说明收益。",
        requiresReshoot: true,
      },
      {
        startSecond: midStart,
        endSecond: midEnd,
        originalContent: "中前段表达",
        problem: "可能存在重复铺垫或不够专业的空泛表述。",
        action: "trim",
        replacementContent: "删掉同义句与无法举证的夸张词，只保留一个证据点。",
        requiresReshoot: false,
      },
      {
        startSecond: tailStart,
        endSecond: duration,
        originalContent: "结尾",
        problem: "CTA 可能不够聚焦，字幕专业收束不足。",
        action: "add_subtitle",
        replacementContent: "用单一大字 CTA 收束，并删掉次要信息与口语填充。",
        requiresReshoot: false,
      },
    ],
    revisedOpening: [
      {
        startSecond: 0,
        endSecond: Math.min(1, duration),
        visual: "最强结果或痛点画面全屏",
        voiceover: evidence.title ?? "先说你最关心的问题。",
        subtitle: evidence.title ?? "3 秒内说清收益",
        audio: "环境音压低，口播前置",
        editingRhythm: "硬切进入，无黑场",
        requiresReshoot: true,
      },
      {
        startSecond: Math.min(1, duration),
        endSecond: hookEnd,
        visual: "证据镜头或对比画面",
        voiceover: "用一句话解释为什么现在要看下去。",
        subtitle: "问题 → 收益",
        audio: "轻节奏底噪",
        editingRhythm: "每 1～1.5 秒一个信息点",
        requiresReshoot: false,
      },
    ],
    hookAlternatives: [
      {
        type: "result",
        voiceover: evidence.title
          ? `看完这条，你会知道「${evidence.title}」的关键做法。`
          : "先看结果，再决定要不要继续看。",
        subtitle: "结果先行",
        visual: "最强成果画面冷开场",
      },
      {
        type: "pain_point",
        voiceover: "如果你也遇到过这个问题，这条能帮你少踩一个坑。",
        subtitle: "痛点先行",
        visual: "问题场景特写",
      },
      {
        type: "suspense",
        voiceover: "很多人在这一步做错了，差别就在前 3 秒。",
        subtitle: "悬念先行",
        visual: "局部特写 + 提问字幕",
      },
    ],
    copySuggestions: {
      originalSummary: evidence.title ?? "未命名草稿视频",
      revisedFullScript: [
        evidence.title ? `【开场】${evidence.title}` : "【开场】用一句话说清主题与收益。",
        "【中段】只保留一个核心证据点；专有名词后跟白话；删绝对化与无法举证的承诺。",
        evidence.goal
          ? `【结尾】围绕「${evidence.goal}」给出单一行动指令。`
          : "【结尾】只保留一个关注/私信/下单动作。",
      ].join("\n"),
      subtitleVersion: [
        evidence.title ?? "主题字幕",
        "证据点（短句）",
        evidence.goal ?? "单一 CTA",
      ].join("｜"),
      cta: evidence.goal
        ? `想${evidence.goal}，评论区留下你的情况。`
        : "觉得有用就关注，下条继续拆。",
    },
    copyAndSubtitleReview: {
      copyRationality:
        "口播主张需可被画面或数据佐证；避免因果倒置、跳跃结论与标题承诺落空。",
      copyProfessionalism:
        "术语使用克制：必要专业词保留并立即白话解释；禁止空话、口号堆砌与夸大疗效式表述。",
      subtitleRationality:
        "字幕与口播同义对齐，数字/对比结论优先上屏；不把口头禅与填充词做成字幕。",
      subtitleProfessionalism:
        "短句分行、信息密度适中；错别字与标点混乱会直接损害专业感。",
      issues: [
        "需人工对照口播转写，确认是否存在无法举证的绝对化用语。",
        "需检查字幕是否过长、是否与口播冲突或漏掉关键数字。",
        tags.length === 0
          ? "未填写标签，文案行业语境与历史对照可能不够准。"
          : `标签「${tags.join("、")}」应在口播/字幕中自然出现，避免硬贴。`,
      ],
      revisionPoints: [
        "开场 3 秒内给出可验证的结果或痛点句，并与标题一致。",
        "每段只保留一个主张 + 一个证据；专有名词后加白话。",
        "字幕每屏 ≤14 字，结尾只留一个 CTA。",
      ],
    },
    titleSuggestions: buildTitleSuggestions(evidence, similarVideos),
    audioSuggestions: {
      currentIssues: evidence.silenceRanges.length
        ? ["存在较长静音或低信息段，可能削弱节奏。"]
        : ["需人工确认口播与 BGM 是否抢戏。"],
      musicMood: "轻快、低干扰，服务信息密度",
      bpmRange: "90-110",
      openingAudioAction: "前 3 秒口播前置，BGM 降低 3～6 dB",
      voiceMusicBalance: "口播为主，BGM 铺底不抢词",
      transitionSuggestions: ["段落切换用短音效或硬切，避免长叠化"],
      avoid: ["全程同一强度 BGM", "结尾突然静音"],
    },
    limitations: [
      "本报告基于媒体证据包与账号基线启发，不含真实逐秒留存数据。",
      hasBaseline
        ? "账号基线来自历史已发布视频，不代表本条草稿的确定表现。"
        : "当前无账号基线，未做历史表现对照。",
      similarVideos.length > 0
        ? "标题建议参考标签相似历史视频的标题与指标，不构成流量承诺。"
        : "相似历史样本不足时，标题建议主要来自标签/标题改写启发式。",
      "文案与字幕的合理性、专业性评估依赖画面证据与模型理解，发布前仍需人工终审。",
    ],
  };
}
