import type {
  DiagnosisResult,
  DraftReviewScriptSnapshot,
  ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import type { AccountBaseline } from "@/lib/metrics/account";
import type { DraftEvidenceManifest } from "@/lib/draft-review/evidence";
import type { SimilarVideoSummary } from "@/lib/draft-review/similar-videos";

type DetailedObservation = NonNullable<
  DiagnosisResult["detailedObservations"]
>[number];
type ScriptAlignment = NonNullable<DiagnosisResult["scriptAlignment"]>;

function excerpt(value: string | null | undefined, max = 180): string {
  const normalized = (value ?? "").replace(/\s+/gu, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function directFrameEvidence(
  evidence: DraftEvidenceManifest,
  startSecond: number,
  endSecond: number,
): string[] {
  return (evidence.frames ?? [])
    .filter(
      (frame) =>
        frame.duplicateOfSecond === null &&
        frame.second >= startSecond &&
        frame.second <= endSecond,
    )
    .flatMap((frame) => {
      const items: string[] = [];
      if (frame.description) {
        items.push(`${frame.second.toFixed(1)}s 画面：${excerpt(frame.description, 120)}`);
      }
      if (frame.ocrText) {
        items.push(`${frame.second.toFixed(1)}s OCR：${excerpt(frame.ocrText, 100)}`);
      }
      return items;
    })
    .slice(0, 5);
}

function timedTranscriptEvidence(
  evidence: DraftEvidenceManifest,
  startSecond: number,
  endSecond: number,
): string[] {
  return (evidence.transcript?.segments ?? [])
    .filter(
      (segment) =>
        segment.endSecond > startSecond && segment.startSecond < endSecond,
    )
    .slice(0, 4)
    .map(
      (segment) =>
        `${segment.startSecond.toFixed(1)}-${segment.endSecond.toFixed(1)}s ASR：${excerpt(segment.text, 180)}`,
    );
}

function observationRange(
  startSecond: number,
  endSecond: number,
  durationSeconds: number,
): { startSecond: number; endSecond: number } {
  const start = Math.max(0, Math.min(startSecond, Math.max(0, durationSeconds - 0.05)));
  const end = Math.max(start + 0.01, Math.min(durationSeconds, endSecond));
  return { startSecond: start, endSecond: end };
}

function buildDetailedObservations(
  evidence: DraftEvidenceManifest,
): DetailedObservation[] {
  const duration = evidence.durationSeconds;
  const opening = observationRange(0, Math.min(3, duration), duration);
  const middle = observationRange(
    Math.min(3, duration / 3),
    Math.min(10, Math.max(3.1, duration * 0.65)),
    duration,
  );
  const tail = observationRange(Math.max(0, duration - 5), duration, duration);
  const transcript = excerpt(evidence.transcript?.text, 220);
  const openingEvidence = [
    ...directFrameEvidence(evidence, opening.startSecond, opening.endSecond),
    ...timedTranscriptEvidence(evidence, opening.startSecond, opening.endSecond),
  ].slice(0, 6);
  const middleEvidence = [
    ...directFrameEvidence(evidence, middle.startSecond, middle.endSecond),
    ...timedTranscriptEvidence(evidence, middle.startSecond, middle.endSecond),
  ].slice(0, 6);
  const tailEvidence = [
    ...directFrameEvidence(evidence, tail.startSecond, tail.endSecond),
    ...timedTranscriptEvidence(evidence, tail.startSecond, tail.endSecond),
  ].slice(0, 6);
  return [
    {
      ...opening,
      evidence:
        openingEvidence.length > 0
          ? openingEvidence
          : [
              `前 3 秒检测到 ${evidence.sceneCutSeconds.filter((item) => item <= 3).length} 处镜头切换；缺少逐帧描述时需点开视频复核。`,
            ],
      issue: "首屏是否在 3 秒内兑现标题承诺仍是最优先发布门槛。",
      priority: "high",
      recommendation: "把结果/痛点、对象和收益分别落在首帧、首句口播和首屏字幕，三者用词一致。",
      replacementExample: evidence.title
        ? `首屏字幕：${excerpt(evidence.title, 32)}`
        : "首屏字幕：具体对象 + 可验证结果",
      expectedMetric: "completion_rate",
      confidence: openingEvidence.length > 0 ? "medium" : "low",
      nature: "inference",
    },
    {
      ...middle,
      evidence:
        middleEvidence.length > 0
          ? middleEvidence
          : transcript
            ? [`ASR 口播节选：${transcript}`]
            : ["没有可用 ASR/OCR 文本，文案与字幕只能做结构性预警。"],
      issue: "中前段需要逐句检查是否一段只承载一个主张，并有画面或事实承接。",
      priority: "high",
      recommendation: "删掉重复铺垫和绝对化词；每个主张后紧跟一个现场、数字、对比或操作证据。",
      replacementExample: "主张一句 → 证据一句 → 对观众的具体意义一句。",
      expectedMetric: "average_watch_seconds",
      confidence: middleEvidence.length > 0 || transcript ? "medium" : "low",
      nature: "inference",
    },
    {
      ...tail,
      evidence:
        tailEvidence.length > 0
          ? tailEvidence
          : [
              evidence.goal
                ? `发布目标为「${excerpt(evidence.goal, 80)}」，需与结尾可见/可听 CTA 对照。`
                : "未填写发布目标，无法确认结尾 CTA 是否服务单一转化动作。",
            ],
      issue: "结尾应只保留一个可执行动作，并与本条发布目标一致。",
      priority: evidence.goal ? "medium" : "high",
      recommendation: "删掉并列 CTA；明确谁在什么场景下评论、私信或关注，以及能得到什么。",
      replacementExample: evidence.goal
        ? `想要${excerpt(evidence.goal, 36)}，评论区留下你的具体场景。`
        : "想拿到同场景清单，评论区留“清单”。",
      expectedMetric: evidence.goal ? "comment_rate" : "follow_rate",
      confidence: tailEvidence.length > 0 ? "medium" : "low",
      nature: "inference",
    },
  ];
}

function characterBigrams(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function overlap(left: string, right: string): number {
  const a = characterBigrams(left);
  const b = characterBigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

function matchStatus(
  expected: string,
  observed: string,
): "matched" | "partial" | "missing" | "not_available" {
  if (!expected.trim() || !observed.trim()) return "not_available";
  const score = overlap(expected, observed);
  if (score >= 0.58) return "matched";
  if (score >= 0.22) return "partial";
  return "missing";
}

function alignmentItem(
  expected: string,
  observed: string,
  recommendation: string,
): ScriptAlignment["openingPromise"] {
  return {
    status: matchStatus(expected, observed),
    expected: excerpt(expected) || "脚本未提供",
    observed: excerpt(observed) || "现有 ASR/OCR 无法确认",
    recommendation,
  };
}

function buildScriptAlignment(
  evidence: DraftEvidenceManifest,
  snapshot: DraftReviewScriptSnapshot | null,
): ScriptAlignment {
  if (!snapshot?.script.trim()) {
    const unavailable = (label: string): ScriptAlignment["openingPromise"] => ({
      status: "not_available",
      expected: "未关联来源脚本",
      observed: label,
      recommendation: "关联脚本工作台草稿后重新审片，系统会冻结当时版本再做逐项对齐。",
    });
    return {
      openingPromise: unavailable("无法对照开头承诺"),
      coreMessage: unavailable("无法对照核心信息"),
      proofAssets: unavailable("无法对照证据资产"),
      cta: unavailable("无法对照 CTA"),
      omissions: [],
      deviations: [],
    };
  }
  const script = snapshot.script.trim();
  const transcript = evidence.transcript?.text?.trim() ?? "";
  const ocr = (evidence.frames ?? [])
    .filter((frame) => frame.duplicateOfSecond === null && frame.ocrText)
    .map((frame) => frame.ocrText)
    .join(" ");
  const observedAll = `${transcript} ${ocr}`.trim();
  const proofLines = script
    .split(/[。！？\n]/u)
    .filter((line) => /数据|案例|现场|对比|实测|证明|因为|结果/u.test(line))
    .join("；");
  const openingPromise = alignmentItem(
    script.slice(0, 100),
    `${transcript.slice(0, 130)} ${ocr.slice(0, 80)}`,
    "让视频首句和首屏字幕复述同一个承诺；若为创意改写，明确保留了什么、改了什么。",
  );
  const coreMessage = alignmentItem(
    script.slice(0, Math.min(500, script.length)),
    observedAll.slice(0, 900),
    "逐段核对脚本主张是否在口播或字幕出现，缺失主张补回，偏离内容单独标注。",
  );
  const proofAssets = alignmentItem(
    proofLines,
    observedAll,
    "脚本写到数字、对比、案例或现场时，画面必须出现对应证据；没有素材就降低承诺强度。",
  );
  const cta = alignmentItem(
    script.slice(Math.max(0, script.length - 140)),
    observedAll.slice(Math.max(0, observedAll.length - 220)),
    "结尾只保留脚本约定的一个动作，并让口播与字幕 CTA 同义。",
  );
  const pairs: Array<[string, ScriptAlignment["openingPromise"]]> = [
    ["开头承诺", openingPromise],
    ["核心信息", coreMessage],
    ["证据资产", proofAssets],
    ["CTA", cta],
  ];
  return {
    openingPromise,
    coreMessage,
    proofAssets,
    cta,
    omissions: pairs
      .filter(([, item]) => item.status === "missing")
      .map(([label]) => `${label}在现有 ASR/OCR 中未找到足够对应内容。`),
    deviations: pairs
      .filter(([, item]) => item.status === "partial")
      .map(([label]) => `${label}仅部分对齐，需人工逐句复核改写是否有意。`),
  };
}

function buildPublishChecklist(
  evidence: DraftEvidenceManifest,
  alignment: ScriptAlignment,
): NonNullable<DiagnosisResult["publishChecklist"]> {
  const alignmentNeedsFix = [
    alignment.openingPromise,
    alignment.coreMessage,
    alignment.proofAssets,
    alignment.cta,
  ].some((item) => item.status === "missing");
  return [
    {
      item: "首屏标题、口播、字幕承诺一致",
      status: alignment.openingPromise.status === "matched" ? "ready" : "verify",
      reason:
        alignment.openingPromise.status === "matched"
          ? "自动对齐达到匹配阈值，仍建议发布前快速通看。"
          : "自动证据不足或仅部分匹配，需要人工在 0～3 秒确认。",
    },
    {
      item: "脚本核心主张和证据素材均已落片",
      status: alignmentNeedsFix ? "fix" : "verify",
      reason: alignmentNeedsFix
        ? "至少一项脚本要素未在 ASR/OCR 中找到对应内容。"
        : "自动识别不能替代对画面细节和事实来源的人工核验。",
    },
    {
      item: "字幕无错字、数字和绝对化承诺已核验",
      status: (evidence.frames ?? []).some((frame) => frame.ocrText)
        ? "verify"
        : "fix",
      reason: (evidence.frames ?? []).some((frame) => frame.ocrText)
        ? "已取得部分 OCR，可按时间帧逐条核对。"
        : "没有可用 OCR，发布前必须人工完整检查字幕。",
    },
    {
      item: "声音清晰且无意外静音",
      status: evidence.silenceRanges.length > 0 ? "verify" : "ready",
      reason:
        evidence.silenceRanges.length > 0
          ? `检测到 ${evidence.silenceRanges.length} 段静音/低声段，需确认是否为有意留白。`
          : "自动检测未发现超过阈值的静音段。",
    },
    {
      item: "结尾只保留一个转化动作",
      status: evidence.goal ? "verify" : "fix",
      reason: evidence.goal
        ? `需对照发布目标「${excerpt(evidence.goal, 60)}」通看尾段。`
        : "未填写发布目标，无法确认 CTA 是否聚焦。",
    },
  ];
}

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
  scriptSnapshot: DraftReviewScriptSnapshot | null = null,
  researchSnapshot: ViralResearchSnapshot | null = null,
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
  if (evidence.transcript?.text) {
    facts.push(
      `已取得口播 ASR 全文（${evidence.transcript.provider}/${evidence.transcript.model}）；模型转写仍需人工核对专有名词与数字。`,
    );
  } else {
    facts.push("未取得可用口播 ASR，文案判断不能视为逐句事实核验。");
  }
  const ocrCount = (evidence.frames ?? []).filter((frame) => frame.ocrText).length;
  facts.push(
    ocrCount > 0
      ? `已从 ${ocrCount} 个去重前时间帧取得 OCR 字幕证据。`
      : "未取得可用 OCR 字幕证据，字幕需人工完整检查。",
  );
  if (researchSnapshot) {
    facts.push(
      `联网研究快照 ${researchSnapshot.id} 获取于 ${researchSnapshot.fetchedAt}，含 ${researchSnapshot.items.length} 条来源；仅作为选题/结构对照，不代表本条必然表现。`,
    );
  }

  const hookEnd = Math.min(3, duration);
  const midStart = Math.min(3, duration);
  const midEnd = Math.min(8, duration);
  const tailStart = Math.max(0, duration - Math.min(6, duration));
  const openingSlow =
    evidence.sceneCutSeconds.filter((second) => second <= 3).length <= 1;
  const scriptAlignment = buildScriptAlignment(evidence, scriptSnapshot);
  const detailedObservations = buildDetailedObservations(evidence);
  const publishChecklist = buildPublishChecklist(evidence, scriptAlignment);

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
    detailedObservations,
    scriptAlignment,
    publishChecklist,
    limitations: [
      "本报告基于媒体证据包与账号基线启发，不含真实逐秒留存数据。",
      hasBaseline
        ? "账号基线来自历史已发布视频，不代表本条草稿的确定表现。"
        : "当前无账号基线，未做历史表现对照。",
      similarVideos.length > 0
        ? "标题建议参考标签相似历史视频的标题与指标，不构成流量承诺。"
        : "相似历史样本不足时，标题建议主要来自标签/标题改写启发式。",
      scriptSnapshot
        ? `脚本对齐使用创建该视频版本时冻结的脚本快照（${scriptSnapshot.scriptUpdatedAt}），字符重合只用于定位待复核项。`
        : "未关联来源脚本，无法判断成片是否遗漏或偏离脚本承诺。",
      researchSnapshot
        ? "联网研究快照有时效和样本边界，热点、公开指标与链接需在发布前再次核验。"
        : "未提供联网研究快照，本报告没有声称使用实时热点或站外爆款数据。",
      ...(evidence.limitations ?? []),
      ...(researchSnapshot?.limitations ?? []).map(
        (item) => `联网研究限制：${item}`,
      ),
      "文案与字幕的合理性、专业性评估依赖画面证据与模型理解，发布前仍需人工终审。",
    ],
  };
}
