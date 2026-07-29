import type { DiagnosisResult } from "@video-diagnosis/shared-types";

const categoryLabel: Record<string, string> = {
  hook: "开头钩子",
  copy: "文案表达",
  visual: "视觉呈现",
  subtitle: "字幕信息",
  pacing: "内容节奏",
  audio: "声音设计",
  structure: "内容结构",
};
const actionLabel: Record<string, string> = {
  delete: "删除",
  trim: "压缩",
  replace: "替换",
  move_forward: "前移",
  speed_up: "加速",
  add_subtitle: "补充字幕",
  change_audio: "调整声音",
  reshoot: "补拍",
  keep: "保留",
};
const metricLabel: Record<string, string> = {
  completion_rate: "完播率",
  average_watch_seconds: "平均观看时长",
  like_rate: "点赞率",
  comment_rate: "评论率",
  share_rate: "分享率",
  follow_rate: "关注率",
};
const confidenceLabel: Record<string, string> = { low: "低", medium: "中", high: "高" };
const hookTypeLabel: Record<string, string> = {
  result: "结果型",
  pain_point: "痛点型",
  suspense: "悬念型",
};
const analysisModeLabel: Record<string, string> = {
  local_rule: "本地规则诊断",
  codex_multimodal: "Codex 多模态诊断",
  worker: "Worker 内容诊断",
};


export function diagnosisToMarkdown(
  title: string,
  publishedAt: string,
  result: DiagnosisResult,
  analysisMode?: string,
): string {
  const openingEndSecond = Math.max(
    0,
    ...result.revisedOpening.map((item) => item.endSecond),
  );
  const openingLabel = Number.isInteger(openingEndSecond)
    ? String(openingEndSecond)
    : openingEndSecond.toFixed(1);
  const problemText = result.primaryProblems
    .map(
      (problem, index) => `### ${index + 1}. ${categoryLabel[problem.category] ?? problem.category}（${problem.startSecond.toFixed(1)}–${problem.endSecond.toFixed(1)} 秒）

- 数据证据：${problem.dataEvidence.join("；")}
- 内容证据：${problem.contentEvidence.join("；")}
- 合理推断：${problem.inference}
- 执行动作：${problem.recommendation}
- 目标指标：${metricLabel[problem.expectedMetric] ?? problem.expectedMetric}
- 置信度：${confidenceLabel[problem.confidence] ?? problem.confidence}`,
    )
    .join("\n\n");
  const editingText = result.editingPlan
    .map(
      (item) =>
        `- **${item.startSecond.toFixed(1)}–${item.endSecond.toFixed(1)} 秒**：${actionLabel[item.action] ?? item.action}；${item.replacementContent}${
          item.sourceAsset
            ? `（使用原片 ${item.sourceAsset.sourceStartSecond.toFixed(1)}–${item.sourceAsset.sourceEndSecond.toFixed(1)} 秒素材）`
            : item.requiresReshoot
              ? "（需要补拍）"
              : ""
        }
  - 原内容：${item.originalContent}
  - 问题：${item.problem}`,
    )
    .join("\n");

  return `# 视频号内容诊断报告

## 视频信息

- 标题：${title}
- 发布时间：${publishedAt}
- 分析来源：${analysisMode ? analysisModeLabel[analysisMode] ?? analysisMode : "结构化内容诊断"}
- 诊断性质：基于账号指标与内容证据的辅助建议

## 执行摘要

${result.executiveSummary}

## 数据事实

${result.dataAssessment.facts.map((fact) => `- ${fact}`).join("\n")}

## ${result.primaryProblems.length} 个主要问题

${problemText}

## 剪辑清单

${editingText}

## 新版前 ${openingLabel} 秒

${result.revisedOpening
  .map(
    (item) =>
      `- **${item.startSecond}–${item.endSecond} 秒**：画面「${item.visual}」；口播「${item.voiceover}」；字幕「${item.subtitle}」；声音「${item.audio}」；节奏「${item.editingRhythm}」${item.sourceAssetStartSecond !== undefined && item.sourceAssetEndSecond !== undefined ? `；原片素材 ${item.sourceAssetStartSecond.toFixed(1)}–${item.sourceAssetEndSecond.toFixed(1)} 秒` : ""}${item.requiresReshoot ? "（需要补拍）" : ""}`,
  )
  .join("\n")}

## 开头备选

${result.hookAlternatives.map((item) => `- ${hookTypeLabel[item.type] ?? item.type}：口播「${item.voiceover}」；字幕「${item.subtitle}」；画面「${item.visual}」`).join("\n")}

## 文案与声音

- 原内容概述：${result.copySuggestions.originalSummary}
- 完整脚本方向：${result.copySuggestions.revisedFullScript}
- 字幕版：${result.copySuggestions.subtitleVersion}
- CTA：${result.copySuggestions.cta}
- 音乐情绪：${result.audioSuggestions.musicMood}
- 当前声音问题：${result.audioSuggestions.currentIssues.join("；") || "未发现明确问题"}
- 开头声音动作：${result.audioSuggestions.openingAudioAction}
- BPM：${result.audioSuggestions.bpmRange ?? "按素材节奏确定"}
- 人声与音乐：${result.audioSuggestions.voiceMusicBalance}
- 转场建议：${result.audioSuggestions.transitionSuggestions.join("；") || "无"}
- 避免事项：${result.audioSuggestions.avoid.join("；") || "无"}

## 局限说明

${result.limitations.map((item) => `- ${item}`).join("\n")}
`;
}
