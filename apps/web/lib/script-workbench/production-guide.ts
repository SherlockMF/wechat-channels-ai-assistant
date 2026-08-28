import type {
  HotspotItem,
  HotspotSnapshot,
  HotspotTopicCard,
  ScriptDraftFormat,
  ScriptDraftInput,
  ScriptDraftOutput,
  ScriptDraftProcessKind,
  ScriptDraftSmartSubTopic,
  ScriptDraftTopic,
  ScriptProductionGuide,
  ViralResearchItem,
  ViralResearchSnapshot,
  ViralResearchTopicCard,
} from "@video-diagnosis/shared-types";
import { preferScriptBody } from "@/lib/script-workbench/display";
import {
  outputToPlainText,
  resolveShootStatus,
} from "@/lib/script-workbench/plain-text";

export interface ScriptGenerateRequest {
  format: ScriptDraftFormat;
  topic: ScriptDraftTopic | null;
  subTopics: ScriptDraftSmartSubTopic[];
  processKinds: ScriptDraftProcessKind[];
  input: ScriptDraftInput;
  referenceHints?: string[];
  /** 仓储按 owner + snapshot id 解析后的运行时研究上下文，不写回 ScriptDraftInput。 */
  researchSnapshot?: ViralResearchSnapshot | null;
  selectedResearchItems?: ViralResearchItem[];
  selectedTopicCard?: ViralResearchTopicCard | null;
  /** 热点工作台带入的运行时上下文，同样按 owner + snapshot id 解析。 */
  hotspotSnapshot?: HotspotSnapshot | null;
  hotspotTopicCard?: HotspotTopicCard | null;
  hotspotItems?: HotspotItem[];
}

const DEFAULT_EDIT_GUIDANCE = [
  "前 3 秒用强画面或痛点字幕抓住停留，再进主体内容",
  "口播句尾卡字幕，单行不超过 12 字，少用长段落",
  "转场以硬切为主，最多 1～2 处轻微缩放或叠化",
  "BGM 压低在口播下方，CTA 前可淡出 0.5 秒",
  "成片过长先删重复演示与空镜，保留一个完整卖点闭环",
];

const DEGRADED_WARNING =
  "生成已降级：模型不可用或返回无效结果，以下为本地模板稿，请人工核对后再用。";

export function sanitizeScriptInput(input: ScriptDraftInput): ScriptDraftInput {
  const shootStatus = resolveShootStatus(input);
  const next: ScriptDraftInput = {
    ...input,
    shootStatus,
    rewriteMode: input.rewriteMode ?? "polish",
    selectedResearchItemIds: input.selectedResearchItemIds?.slice(0, 5),
  };
  if (shootStatus !== "shot") {
    const { materialNotes: _drop, ...rest } = next;
    return rest;
  }
  return next;
}

export function guideSectionsFromOutput(
  output: ScriptDraftOutput,
): Array<{ section: string; cue: string }> {
  if (output.pipeline === "koubo") {
    if (output.brollCues.length) {
      return output.brollCues.map((cue) => ({
        section: cue.section,
        cue: cue.cue,
      }));
    }
    return [
      { section: "开头痛点", cue: "生活痛点画面" },
      { section: "方案/产品", cue: "产品或效果演示" },
      { section: "收束CTA", cue: "品牌/联系方式露出" },
    ];
  }
  if (output.timeline.length) {
    return output.timeline.map((step) => ({
      section: `第${step.order}段`,
      cue: step.shoot,
    }));
  }
  return [
    { section: "开场", cue: "环境建立" },
    { section: "主体", cue: "核心过程" },
    { section: "收束", cue: "结论与 CTA" },
  ];
}

export function buildProductionGuide(
  request: Pick<ScriptGenerateRequest, "input">,
  sections: Array<{ section: string; cue: string }>,
  existing?: ScriptProductionGuide,
): ScriptProductionGuide {
  const shootStatus = resolveShootStatus(request.input);
  const notes = request.input.materialNotes?.trim();
  const idea = request.input.idea.trim();
  const editGuidance =
    existing?.editGuidance.filter((item) => item.trim()).length
      ? existing.editGuidance.filter((item) => item.trim())
      : [...DEFAULT_EDIT_GUIDANCE];

  if (shootStatus === "shot") {
    const keepMaterials =
      existing?.shootStatus === "shot" &&
      (existing.materials?.length ?? 0) > 0 &&
      !notes;
    return {
      shootStatus,
      editGuidance,
      materials: keepMaterials
        ? existing!.materials
        : sections.map((item, index) => ({
            section: item.section,
            description: notes
              ? `优先用手头素材：${notes}。本段对应「${item.cue}」，选最清晰的 1～2 段，去抖后对齐口播。`
              : `按文案推断素材：${item.cue}（围绕「${idea.slice(0, 24)}」）。准备 ${3 + index}～${5 + index} 秒可用片段，避免晃动与过曝。`,
          })),
      storyboard: [],
    };
  }

  const keepStoryboard =
    existing?.shootStatus === "unshot" &&
    (existing.storyboard?.length ?? 0) > 0;
  return {
    shootStatus,
    editGuidance,
    materials: [],
    storyboard: keepStoryboard
      ? existing!.storyboard.map((item, index) => ({
          ...item,
          order: Number.isFinite(item.order) ? item.order : index + 1,
        }))
      : sections.map((item, index) => ({
          order: index + 1,
          shot: item.cue,
          camera:
            index === 0
              ? "中近景固定或缓慢推进"
              : index === sections.length - 1
                ? "中景收束，留字幕安全区"
                : "特写 + 中景交替",
          durationHint: `${3 + index}～${5 + index} 秒`,
          voiceCue: item.section,
        })),
  };
}

function stripInternalLeak(warnings: string[]): string[] {
  return warnings.filter(
    (item) => !/内部备注|不对外/u.test(item) || /降级/u.test(item),
  );
}

export function markDegradedOutput(
  output: ScriptDraftOutput,
): ScriptDraftOutput {
  const warnings = stripInternalLeak(output.gapsOrWarnings);
  if (!warnings.some((item) => item.includes("降级"))) {
    warnings.unshift(DEGRADED_WARNING);
  }
  const next: ScriptDraftOutput = {
    ...output,
    gapsOrWarnings: warnings,
  };
  next.plainText = outputToPlainText(next);
  return next;
}

/**
 * Align productionGuide with input.shootStatus, optionally keep user script,
 * and rebuild plainText. Call after any provider generate / preferScriptBody.
 */
export function finalizeScriptOutput(
  request: Pick<
    ScriptGenerateRequest,
    "format" | "topic" | "subTopics" | "processKinds" | "input"
  >,
  output: ScriptDraftOutput,
  options?: { preferExistingScript?: boolean; degraded?: boolean },
): ScriptDraftOutput {
  const sanitizedRequest = {
    ...request,
    input: sanitizeScriptInput(request.input),
  };
  let next = output;
  const preferExistingScript =
    options?.preferExistingScript ??
    sanitizedRequest.input.rewriteMode === "preserve";
  if (preferExistingScript) {
    next = preferScriptBody(next, sanitizedRequest.input.existingScript);
  }
  const sections = guideSectionsFromOutput(next);
  next = {
    ...next,
    gapsOrWarnings: stripInternalLeak(next.gapsOrWarnings),
    productionGuide: buildProductionGuide(
      sanitizedRequest,
      sections,
      next.productionGuide,
    ),
    plainText: "",
  };
  next.plainText = outputToPlainText(next);
  if (options?.degraded) {
    next = markDegradedOutput(next);
  }
  return next;
}
