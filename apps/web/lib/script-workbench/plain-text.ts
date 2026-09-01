import type {
  ScriptDraftInput,
  ScriptDraftOutput,
  ScriptProductionGuide,
  ScriptShootStatus,
} from "@video-diagnosis/shared-types";

export function resolveShootStatus(
  input: Pick<ScriptDraftInput, "shootStatus">,
): ScriptShootStatus {
  return input.shootStatus === "shot" ? "shot" : "unshot";
}

/** 只取结构化的最终口播正文，供再生成使用，避免把标题和制作指导喂回正文。 */
export function structuredSpokenBody(
  output: ScriptDraftOutput | null | undefined,
): string {
  if (!output) return "";
  if (output.pipeline === "koubo") return output.script.trim();
  return output.timeline
    .map((item) => item.say.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * 从用户可编辑的完整制作包里恢复口播正文。若仍是标准导出格式，优先保留用户
 * 在【口播稿】或“说：”行里的修改；无法可靠识别时才回退到结构化字段。
 */
export function editedSpokenBody(
  editedPlainText: string | null | undefined,
  output: ScriptDraftOutput | null | undefined,
): string {
  const edited = editedPlainText?.trim();
  if (!edited) return structuredSpokenBody(output);

  const kouboSection = edited.match(
    /(?:^|\n)【口播稿】\s*\n([\s\S]*?)(?=\n【[^\n】]+】|$)/u,
  )?.[1]?.trim();
  if (kouboSection) return kouboSection;

  const spokenLines = [...edited.matchAll(/^\s*(?:说：|说:)\s*(.+?)\s*$/gmu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (spokenLines.length) return spokenLines.join("\n");

  // 没有任何制作包标题时，视为用户只粘贴/改写了正文。
  if (!/^【[^\n】]+】/mu.test(edited)) return edited;
  return structuredSpokenBody(output);
}

export function appendProductionGuidePlainText(
  lines: string[],
  guide: ScriptProductionGuide | undefined,
): void {
  if (!guide) return;
  lines.push("");
  lines.push("【拍摄与剪辑指导】");
  lines.push(
    `状态：${guide.shootStatus === "shot" ? "已拍摄" : "未拍摄"}`,
  );
  if (guide.shootStatus === "shot" && guide.materials.length) {
    lines.push("");
    lines.push("素材描述：");
    for (const item of guide.materials) {
      lines.push(`- ${item.section}：${item.description}`);
    }
  }
  if (guide.shootStatus === "unshot" && guide.storyboard.length) {
    lines.push("");
    lines.push("拍摄分镜：");
    for (const shot of guide.storyboard) {
      lines.push(
        `${shot.order}. ${shot.shot}｜${shot.camera}｜${shot.durationHint}`,
      );
      if (shot.voiceCue) lines.push(`   对应：${shot.voiceCue}`);
    }
  }
  if (guide.editGuidance.length) {
    lines.push("");
    lines.push("剪辑建议：");
    for (const tip of guide.editGuidance) {
      lines.push(`- ${tip}`);
    }
  }
}

export function outputToPlainText(output: ScriptDraftOutput): string {
  const lines: string[] = [];
  if (output.pipeline === "koubo") {
    if (output.titles.length) {
      lines.push("【标题备选】");
      output.titles.forEach((title, index) => {
        lines.push(`${index + 1}. ${title}`);
      });
      lines.push("");
    }
    if (output.tags.length) {
      lines.push(`【标签】${output.tags.map((tag) => `#${tag}`).join(" ")}`);
      lines.push("");
    }
    lines.push("【口播稿】");
    lines.push(output.script.trim());
    lines.push("");
    if (output.brollCues.length) {
      lines.push("【穿插素材】");
      for (const cue of output.brollCues) {
        lines.push(`- ${cue.section}：${cue.cue}`);
      }
      lines.push("");
    }
    if (output.subtitleBeats.length) {
      lines.push("【字幕要点】");
      for (const beat of output.subtitleBeats) {
        lines.push(`- ${beat}`);
      }
      lines.push("");
    }
    if (output.altHooks.length) {
      lines.push("【备选开头】");
      output.altHooks.forEach((hook, index) => {
        lines.push(`${index + 1}. ${hook}`);
      });
    }
  } else {
    if (output.positioning) {
      lines.push("【本片定位】");
      lines.push(output.positioning);
      lines.push("");
    }
    if (output.titles.length) {
      lines.push("【标题备选】");
      output.titles.forEach((title, index) => {
        lines.push(`${index + 1}. ${title}`);
      });
      lines.push("");
    }
    if (output.timeline.length) {
      lines.push("【拍摄/剪辑顺序】");
      for (const step of output.timeline) {
        lines.push(`${step.order}. 拍：${step.shoot}`);
        if (step.say) lines.push(`   说：${step.say}`);
        if (step.subtitle) lines.push(`   字幕：${step.subtitle}`);
      }
      lines.push("");
    }
    if (output.gapsOrWarnings.length) {
      lines.push("【补拍/注意】");
      for (const item of output.gapsOrWarnings) {
        lines.push(`- ${item}`);
      }
    }
  }
  appendProductionGuidePlainText(lines, output.productionGuide);
  return lines.join("\n").trim();
}

/** 全文是否与结构化字段重建结果不一致（手工改过） */
export function plainTextDivergesFromStructured(
  output: ScriptDraftOutput,
): boolean {
  const stored = (output.plainText ?? "").trim();
  if (!stored) return false;
  return stored !== outputToPlainText(output);
}
