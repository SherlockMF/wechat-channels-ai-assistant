import type { ScriptDraftOutput } from "@video-diagnosis/shared-types";

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
  return lines.join("\n").trim();
}
