import type {
  ScriptDraftOutput,
  ScriptReview,
  ScriptViralPlan,
} from "@video-diagnosis/shared-types";
import type { ScriptGenerateRequest } from "@/lib/script-workbench/production-guide";

const HOOK_MECHANISMS: ScriptViralPlan["hookMechanisms"][number]["mechanism"][] = [
  "result",
  "loss_aversion",
  "real_case",
];

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
}

export function resolveResearchStatus(
  request: ScriptGenerateRequest,
): ScriptViralPlan["researchStatus"] {
  const snapshot = request.researchSnapshot;
  if (!snapshot) {
    return request.input.researchSnapshotId ? "unverified" : "skipped";
  }
  const expiresAt = Date.parse(snapshot.expiresAt);
  const fresh = Number.isFinite(expiresAt) && expiresAt > Date.now();
  const hasExternalEvidence = (request.selectedResearchItems ?? []).some(
    (item) =>
      item.sourceType !== "owned_history" &&
      (item.evidenceLevel === "public_source" ||
        item.evidenceLevel === "verified_metric"),
  );
  return snapshot.searchPerformed && fresh && hasExternalEvidence
    ? "verified"
    : "unverified";
}

function fallbackHooks(
  request: ScriptGenerateRequest,
  output: ScriptDraftOutput,
): ScriptViralPlan["hookMechanisms"] {
  const seed = request.input.idea.trim();
  const candidates = uniqueNonEmpty([
    ...output.altHooks,
    ...output.titles,
    output.positioning,
    `先看结果：${seed}`,
    `别再为这件事多花冤枉钱：${seed}`,
    `真实现场里，${seed}`,
  ]).slice(0, 3);
  return HOOK_MECHANISMS.map((mechanism, index) => ({
    mechanism,
    hook:
      candidates[index] ??
      (index === 0
        ? `先看结果：${seed}`
        : index === 1
          ? `别再踩这个坑：${seed}`
          : `真实案例：${seed}`),
  }));
}

function fallbackEvidenceBeats(
  output: ScriptDraftOutput,
): ScriptViralPlan["evidenceBeats"] {
  if (output.pipeline === "koubo") {
    return output.brollCues.map((cue, index) => ({
      section: cue.section,
      claim: cue.cue,
      voiceover: index === 0 ? output.altHooks[0] || output.script : "对应口播段落",
      visual: cue.cue,
      subtitle: output.subtitleBeats[index] || "提炼本段一个字幕重点",
      audio: index === 0 ? "开头声音动作与第一句同步" : "BGM 压低，保留清晰人声",
      evidenceNeeded: `拍到可验证「${cue.cue}」的真实画面或操作过程`,
    }));
  }
  return output.timeline.map((step) => ({
    section: `第 ${step.order} 段`,
    claim: step.say || step.subtitle || step.shoot,
    voiceover: step.say,
    visual: step.shoot,
    subtitle: step.subtitle,
    audio: "优先保留清晰人声或现场声，BGM 不盖过信息",
    evidenceNeeded: step.shoot,
  }));
}

function fallbackPublishingMetrics(
  request: ScriptGenerateRequest,
): ScriptViralPlan["publishingMetrics"] {
  const common = [
    { metric: "3 秒停留率", hypothesis: "三种机制开头中至少一版能减少首屏划走" },
    { metric: "完播率", hypothesis: "逐段只保留一个信息任务，降低中段流失" },
  ];
  switch (request.input.contentGoal) {
    case "lead_generation":
      return [
        ...common,
        { metric: "私信/咨询率", hypothesis: "具体且低门槛的 CTA 会提升有效咨询" },
      ];
    case "engagement":
      return [
        ...common,
        { metric: "评论率", hypothesis: "结尾给出明确选择题会增加真实讨论" },
      ];
    case "brand":
      return [
        ...common,
        { metric: "关注率", hypothesis: "真实案例与稳定专业表达会增强账号记忆" },
      ];
    default:
      return common;
  }
}

export function buildFallbackViralPlan(
  request: ScriptGenerateRequest,
  output: ScriptDraftOutput,
): ScriptViralPlan {
  const status = resolveResearchStatus(request);
  const card = request.selectedTopicCard;
  const sourceIds = uniqueNonEmpty([
    ...(request.selectedResearchItems ?? []).map((item) => item.id),
  ]).slice(0, 5);
  const limitations = uniqueNonEmpty([
    ...(request.researchSnapshot?.limitations ?? []),
    request.researchSnapshot?.degradedReason,
    status === "unverified"
      ? "研究快照缺失、过期、未执行外部检索或未选择公开证据；本稿不得声称已联网验证。"
      : null,
    status === "skipped"
      ? "本次跳过联网研究，爆款拆解仅依据用户输入与账号历史参考。"
      : null,
    status === "verified" && sourceIds.length === 0
      ? "研究快照可用，但用户未选择具体参考条目。"
      : null,
  ]);
  return {
    researchStatus: status,
    topicAngle: card?.originalAngle || output.positioning || request.input.idea,
    whyNow:
      card?.whyNow ||
      request.researchSnapshot?.commonPatterns[0] ||
      "从明确生活场景切入，用真实证据降低理解成本。",
    targetAudience:
      card?.targetAudience ||
      request.input.audience ||
      "对当前问题有明确感知、正在比较解决方案的本地用户",
    hookMechanisms: fallbackHooks(request, output),
    coverCopy: output.titles[0] || request.input.idea,
    evidenceBeats: fallbackEvidenceBeats(output),
    publishingMetrics: fallbackPublishingMetrics(request),
    sourceIds,
    limitations,
  };
}

export function shouldShowViralPlan(
  viralPlan: ScriptViralPlan | undefined,
): boolean {
  if (!viralPlan) return false;
  return viralPlan.researchStatus !== "skipped";
}

function originalSentenceMatchesExisting(
  original: string,
  existing: string,
): boolean {
  const trimmed = original.trim();
  if (!trimmed) return false;
  if (existing.includes(trimmed)) return true;
  const normalizedExisting = existing.replace(/\s+/g, "");
  const normalizedOriginal = trimmed.replace(/\s+/g, "");
  if (
    normalizedOriginal &&
    normalizedExisting.includes(normalizedOriginal)
  ) {
    return true;
  }
  return existing
    .split(/\r?\n/u)
    .some((line) => line.trim() === trimmed);
}

export function sanitizeScriptReview(
  request: ScriptGenerateRequest,
  review: ScriptReview,
): ScriptReview {
  const existing = request.input.existingScript?.trim();
  if (!existing) {
    return {
      ...review,
      lineIssues: [],
      summary: review.summary.includes("保留原稿")
        ? "已生成完整脚本，请重点复核事实、承诺边界与行动号召。"
        : review.summary,
    };
  }
  if ((request.input.rewriteMode ?? "polish") === "preserve") {
    return {
      ...review,
      lineIssues: review.lineIssues.filter((issue) =>
        originalSentenceMatchesExisting(issue.original, existing),
      ),
    };
  }
  return review;
}

export function buildFallbackScriptReview(
  request: ScriptGenerateRequest,
  output: ScriptDraftOutput,
): ScriptReview {
  const existing = request.input.existingScript?.trim();
  const mode = request.input.rewriteMode ?? "polish";
  const firstHook = output.viralPlan?.hookMechanisms[0]?.hook || output.altHooks[0] || "";
  const lineIssues: ScriptReview["lineIssues"] = [];
  if (existing && mode === "preserve" && firstHook) {
    lineIssues.push({
      original: existing.split(/\r?\n/u)[0]?.slice(0, 80) || existing.slice(0, 80),
      problem: "原稿正文按要求保留，但开头仍可单独 A/B 测试。",
      replacement: firstHook,
      reason: "只替换首屏钩子，不改动原稿事实与主体表达。",
      priority: "high",
    });
  }
  const claimsToVerify: ScriptReview["claimsToVerify"] = [];
  if (request.input.sellingPoints?.trim() && !request.input.claimEvidence?.trim()) {
    claimsToVerify.push({
      claim: request.input.sellingPoints.trim(),
      risk: "用户提供了卖点，但未附可核验案例、参数或现场证据。",
      safeWording: `可将绝对表述改为体验描述，并补拍能够证明「${request.input.sellingPoints.trim()}」的画面。`,
    });
  }
  if (!request.input.claimEvidence?.trim()) {
    const riskyClaimPattern =
      /(?:\d+(?:\.\d+)?\s*(?:%|元|块|万|万元)|健康|治愈|治疗|杀菌|除菌|零风险|无害|甲醛|最(?:好|省|强|快|安全)|第一|绝对|100%|保证|彻底|永久|完全|一定)/u;
    const candidates = uniqueNonEmpty([existing, output.script])
      .flatMap((text) => text.split(/[。！？!?；;\n]+/u))
      .map((text) => text.trim())
      .filter((text) => text && riskyClaimPattern.test(text));
    for (const claim of [...new Set(candidates)]) {
      if (claimsToVerify.some((item) => item.claim === claim)) continue;
      claimsToVerify.push({
        claim,
        risk: "包含金额、比例、健康/安全效果或绝对化表达，但未提供 claimEvidence。",
        safeWording:
          "改为基于本次真实场景的可观察体验，并注明具体效果、费用或安全结论以现场条件、正式报价和产品说明为准。",
      });
    }
  }
  return {
    summary: !existing
      ? "已生成完整脚本，请重点复核事实、承诺边界与行动号召。"
      : mode === "preserve"
        ? "已保留原稿正文，质检重点放在开头、证据、标题与行动号召。"
        : mode === "deep"
          ? "已按传播目标重组脚本，请重点复核事实、承诺边界与品牌口径。"
          : "已适度润色节奏与表达，并保留原稿核心事实和意图。",
    lineIssues,
    consistency: {
      titleToOpening: "标题承诺应在前 3 秒由口播或画面立即兑现。",
      openingToBody: "开头提出的问题应在主体第一段给出明确回应。",
      bodyToCta: request.input.ctaGoal?.trim()
        ? `主体证据应自然导向 CTA：${request.input.ctaGoal.trim()}`
        : "CTA 需承接主体价值，避免突然转成硬广。",
    },
    claimsToVerify,
    originality:
      "参考条目只用于提炼机制与信息顺序，标题、案例和表达需基于本账号真实素材重新创作。",
    abTests: [
      {
        variable: "开头机制",
        variantA: output.viralPlan?.hookMechanisms[0]?.hook || output.altHooks[0] || "结果前置",
        variantB: output.viralPlan?.hookMechanisms[1]?.hook || output.altHooks[1] || "损失规避",
        metric: "3 秒停留率",
      },
      {
        variable: "标题/封面",
        variantA: output.titles[0] || "主标题",
        variantB: output.titles[1] || "备选标题",
        metric: "点击进入率与完整播放量",
      },
    ],
  };
}

export function ensureViralEnhancements(
  request: ScriptGenerateRequest,
  output: ScriptDraftOutput,
): ScriptDraftOutput {
  const fallbackPlan = buildFallbackViralPlan(request, output);
  const modelPlan = output.viralPlan;
  const hookMechanisms = modelPlan
    ? [
        ...modelPlan.hookMechanisms,
        ...fallbackPlan.hookMechanisms,
      ].filter(
        (item, index, rows) =>
          rows.findIndex(
            (candidate) => candidate.mechanism === item.mechanism,
          ) === index,
      ).slice(0, 3)
    : fallbackPlan.hookMechanisms;
  const withPlan: ScriptDraftOutput = {
    ...output,
    viralPlan: modelPlan
      ? {
          ...modelPlan,
          researchStatus: fallbackPlan.researchStatus,
          hookMechanisms,
          evidenceBeats: modelPlan.evidenceBeats.length
            ? modelPlan.evidenceBeats
            : fallbackPlan.evidenceBeats,
          publishingMetrics: modelPlan.publishingMetrics.length
            ? modelPlan.publishingMetrics
            : fallbackPlan.publishingMetrics,
          sourceIds: fallbackPlan.sourceIds,
          limitations: uniqueNonEmpty([
            ...modelPlan.limitations,
            ...fallbackPlan.limitations,
          ]),
        }
      : fallbackPlan,
  };
  const scriptReview = sanitizeScriptReview(
    request,
    withPlan.scriptReview ?? buildFallbackScriptReview(request, withPlan),
  );
  return {
    ...withPlan,
    scriptReview,
  };
}
