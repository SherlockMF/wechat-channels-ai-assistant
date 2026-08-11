import type { ScriptDraft, ScriptDraftOutput } from "@video-diagnosis/shared-types";
import {
  formatLabel,
  smartSubTopicLabels,
  topicLabel,
} from "@/lib/script-workbench/catalog";

/** 从长文抽一句话钩子，避免列表标题变成整段口播 */
export function shortHook(text: string, max = 22): string {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => {
      if (!line) return false;
      if (/^画面思路/u.test(line)) return true;
      if (/^[（(]\d/u.test(line)) return false;
      if (/^\d+[-~～]\d+秒/u.test(line)) return false;
      return true;
    })
    ?.replace(/^画面思路[：:]\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();

  if (!cleaned) {
    const fallback = text.replace(/\s+/gu, " ").trim();
    if (!fallback) return "";
    return fallback.length <= max ? fallback : `${fallback.slice(0, max)}…`;
  }
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max)}…`;
}

function looksLikeSpokenBody(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  // 超过短标题长度，或带分镜时间码/口播套话，视为正文而非标题
  if (value.length > 28) return true;
  if (/[（(]\d+\s*[-~～]\s*\d+\s*秒/u.test(value)) return true;
  if (/产品展示|痛点开场|总结种草|真的太麻烦|油烟大|手上全是/u.test(value)) {
    return true;
  }
  return false;
}

export function pickDisplayTitle(draft: {
  title?: string | null;
  ideaSummary?: string | null;
  idea?: string | null;
  existingScript?: string | null;
  topicLabel?: string;
  subLabels?: string[];
  formatLabel?: string;
  outputTitles?: string[];
}): string {
  const candidates = [
    draft.idea,
    draft.title,
    ...(draft.outputTitles ?? []),
    draft.ideaSummary,
  ]
    .map((item) => item?.trim() || "")
    .filter(Boolean);

  for (const candidate of candidates) {
    if (!looksLikeSpokenBody(candidate)) {
      return shortHook(candidate, 28);
    }
  }

  const visual = draft.existingScript
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => /^画面思路/u.test(line));
  if (visual) {
    return shortHook(visual.replace(/^画面思路[：:]\s*/u, ""), 28);
  }

  const sub = draft.subLabels?.[0];
  if (sub && draft.topicLabel) return `${draft.topicLabel}｜${sub}`;
  if (draft.topicLabel) return draft.topicLabel;
  if (draft.formatLabel) return draft.formatLabel;
  return "未命名脚本";
}

export function summarizeIdea(input: {
  idea: string;
  existingScript?: string;
}): string {
  const idea = input.idea.trim();
  if (idea && !looksLikeSpokenBody(idea)) {
    return shortHook(idea, 48);
  }
  if (idea) {
    const fromIdea = shortHook(idea, 48);
    if (fromIdea) return fromIdea;
  }
  if (input.existingScript?.trim()) {
    const visual = input.existingScript
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^画面思路/u.test(line));
    if (visual) return shortHook(visual.replace(/^画面思路[：:]\s*/u, ""), 48);
  }
  return shortHook(idea || "脚本草稿", 48);
}

export function resolveDraftListTitle(draft: ScriptDraft): string {
  return pickDisplayTitle({
    title: draft.title,
    ideaSummary: draft.ideaSummary,
    idea: draft.input?.idea,
    existingScript: draft.input?.existingScript,
    topicLabel: topicLabel(draft.topic, draft.topicOther),
    subLabels: smartSubTopicLabels(draft.subTopics ?? []),
    formatLabel: formatLabel(draft.format, draft.formatOther),
    outputTitles: draft.output?.titles,
  });
}

export function resolveDraftListSubtitle(draft: ScriptDraft): string {
  const summary = summarizeIdea({
    idea: draft.input?.idea || draft.ideaSummary || "",
    existingScript: draft.input?.existingScript,
  });
  const title = resolveDraftListTitle(draft);
  if (summary && summary !== title) return summary;
  if (draft.input?.existingScript?.trim()) return "已附当前口播稿";
  return formatLabel(draft.format, draft.formatOther);
}

export function sanitizeGeneratedTitles(
  titles: string[],
  fallbackIdea: string,
): string[] {
  const cleaned = titles
    .map((title) => title.trim())
    .filter((title) => title && !looksLikeSpokenBody(title))
    .map((title) => shortHook(title, 28));
  const normalizedIdea = fallbackIdea.replace(/\s+/gu, " ").trim();
  const firstClause = normalizedIdea.split(/[，。！？；：|｜—]/u)[0]?.trim() ?? "";
  const safeSeed =
    firstClause && firstClause.length <= 16 ? firstClause : "这个居住问题";
  const fallbacks = [
    `先看结果｜${safeSeed}`,
    `别再踩坑｜${safeSeed}`,
    `真实案例｜${safeSeed}`,
    "先看结果再做决定",
    "装修前先避开这个坑",
  ];
  const unique = [...new Set([...cleaned, ...fallbacks])].filter(
    (title) => title.length <= 28 && !looksLikeSpokenBody(title),
  );
  return unique.slice(0, 3);
}

export function preferScriptBody(
  output: ScriptDraftOutput,
  existingScript?: string,
): ScriptDraftOutput {
  const existing = existingScript?.trim();
  if (!existing) return output;
  if (output.script.trim() === existing) return output;
  // 已有稿时以用户正文为准，避免模型改写成列表标题那种碎句
  return { ...output, script: existing };
}
