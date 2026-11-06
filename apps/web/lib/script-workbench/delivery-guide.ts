import { createHash } from "node:crypto";
import { extractPrompterText } from "@/lib/script-workbench/editing";
import { structuredSpokenBody } from "@/lib/script-workbench/plain-text";
import type {
  ScriptDeliveryGuide,
  ScriptDraftOutput,
} from "@video-diagnosis/shared-types";
import { scriptDeliveryGuideSchema } from "@video-diagnosis/shared-types";
export { structuredSpokenBody } from "@/lib/script-workbench/plain-text";

type DeliveryBlock = ScriptDeliveryGuide["blocks"][number];
type DeliverySegment = DeliveryBlock["segments"][number];

const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const LETTERS: Record<string, string> = {
  A: "诶", B: "比", C: "西", D: "迪", E: "伊", F: "艾弗", G: "吉",
  H: "艾尺", I: "艾", J: "杰", K: "开", L: "艾勒", M: "艾姆", N: "恩",
  O: "欧", P: "批", Q: "丘", R: "阿尔", S: "艾丝", T: "提", U: "优",
  V: "维", W: "达布流", X: "艾克斯", Y: "歪", Z: "贼德",
};

export function hashSource(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function integerToChinese(raw: string): string {
  const normalized = raw.replace(/^0+(?=\d)/u, "");
  if (normalized.length > 12) {
    return normalized.split("").map((digit) => DIGITS[Number(digit)]).join("");
  }
  const units = ["", "十", "百", "千", "万", "十", "百", "千", "亿", "十", "百", "千"];
  let output = "";
  let pendingZero = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const digit = Number(normalized[index]);
    const position = normalized.length - index - 1;
    if (digit === 0) {
      pendingZero = Boolean(output) && position > 0;
      if (position === 4 && output && !output.endsWith("万")) output += "万";
      if (position === 8 && output && !output.endsWith("亿")) output += "亿";
      continue;
    }
    if (pendingZero && !output.endsWith("万") && !output.endsWith("亿")) output += "零";
    pendingZero = false;
    const omitLeadingOne = digit === 1 && position % 4 === 1 && !output;
    if (!omitLeadingOne) output += DIGITS[digit];
    output += units[position] ?? "";
  }
  return output || "零";
}

function numberToChinese(raw: string): string {
  const [integer, decimal] = raw.split(".");
  const base = integerToChinese(integer ?? "0");
  return decimal
    ? `${base}点${decimal.split("").map((digit) => DIGITS[Number(digit)]).join("")}`
    : base;
}

function actualSpokenText(text: string): string {
  return text
    .replace(/(\d{4})年/gu, (_, year: string) =>
      `${year.split("").map((digit) => DIGITS[Number(digit)]).join("")}年`,
    )
    .replace(/(\d+(?:\.\d+)?)%/gu, (_, number: string) => `百分之${numberToChinese(number)}`)
    .replace(/\d+(?:\.\d+)?/gu, (number) =>
      /^\d{5,}$/u.test(number)
        ? number.split("").map((digit) => DIGITS[Number(digit)]).join("")
        : numberToChinese(number),
    )
    .replace(/\b[A-Z]{1,6}\b/gu, (word) =>
      word.split("").map((letter) => LETTERS[letter] ?? letter).join(""),
    );
}

function pronunciationEntries(text: string): DeliverySegment["pronunciation"] {
  return [...text.matchAll(/\d+(?:\.\d+)?%?|[A-Za-z][A-Za-z0-9+-]*/gu)]
    .slice(0, 24)
    .map((match) => {
      const source = match[0];
      const isEnglish = /^[A-Za-z]/u.test(source);
      return {
        text: source,
        spokenAs: actualSpokenText(source),
        needsReview: isEnglish,
        note: isEnglish ? "英文、型号或品牌读法请按账号口径确认" : undefined,
      };
    });
}

function segmentEmotion(text: string): DeliverySegment["emotion"] {
  if (/[？?]/u.test(text)) return "questioning";
  if (/风险|不能|不要|避免|警惕/u.test(text)) return "serious";
  if (/放心|可以|建议|适合/u.test(text)) return "reassuring";
  if (/[！!]/u.test(text)) return "confident";
  return "warm";
}

function emphasisWords(text: string): string[] {
  const candidates = [
    ...text.matchAll(/\d+(?:\.\d+)?%?|结果|重点|关键|不要|不能|建议|注意|真实|安全|省心/gu),
  ].map((match) => match[0]);
  return [...new Set(candidates)].slice(0, 8);
}

function fallbackSegments(sourceText: string): DeliverySegment[] {
  const chunks = sourceText
    .split(/(?<=[。！？!?；;\n])/u)
    .filter((item) => item.length > 0)
    .reduce<string[]>((parts, item) => {
      if (!item.trim() && parts.length) parts[parts.length - 1] += item;
      else parts.push(item);
      return parts;
    }, []);
  return (chunks.length ? chunks : [sourceText]).map((text, index, all) => ({
    text,
    spokenAs: actualSpokenText(text),
    pace: text.length > 34 ? "slow" : text.length < 12 ? "normal" : "normal",
    emotion: segmentEmotion(text),
    intensity: /[！!]/u.test(text) ? 2 : 1,
    emphasis: emphasisWords(text),
    pauseAfter: index === all.length - 1 ? "long" : /[。！？!?]/u.test(text) ? "short" : "micro",
    breathBefore: index > 0 && text.length > 18,
    pronunciation: pronunciationEntries(text),
    action: /[？?]/u.test(text)
      ? "提问时微微前倾，看镜头后留出回答感"
      : index === all.length - 1
        ? "收尾看镜头，句末停稳"
        : "保持自然手势，重读时轻点头",
  }));
}

function sourceBlocks(output: ScriptDraftOutput): Array<Omit<DeliveryBlock, "segments">> {
  if (output.pipeline === "koubo") {
    const sourceText = output.script.trim();
    return sourceText
      ? [{ kind: "script", sourceText, sourceHash: hashSource(sourceText) }]
      : [];
  }
  return output.timeline
    .filter((item) => item.say.trim())
    .map((item) => {
      const sourceText = item.say.trim();
      return {
        kind: "timeline_say" as const,
        order: item.order,
        sourceText,
        sourceHash: hashSource(sourceText),
      };
    });
}

function candidateMatches(
  source: Omit<DeliveryBlock, "segments">,
  candidate: DeliveryBlock | undefined,
): candidate is DeliveryBlock {
  if (!candidate || !candidate.segments.length) return false;
  if (
    candidate.kind !== source.kind ||
    candidate.order !== source.order ||
    candidate.sourceText !== source.sourceText ||
    candidate.sourceHash !== source.sourceHash
  ) return false;
  let cursor = 0;
  const fullyAligned = candidate.segments.every((segment) => {
    if (!segment.text.trim() || !segment.spokenAs.trim()) return false;
    if (
      segment.emphasis.some((token) => !segment.text.includes(token)) ||
      segment.pronunciation.some((entry) => !segment.text.includes(entry.text))
    ) {
      return false;
    }
    if (source.sourceText.slice(cursor, cursor + segment.text.length) !== segment.text) {
      return false;
    }
    cursor += segment.text.length;
    return true;
  });
  return fullyAligned && cursor === source.sourceText.length;
}

/** Return a copy whose guide is aligned to the final script/timeline say blocks. */
export function ensureDeliveryGuide(output: ScriptDraftOutput): ScriptDraftOutput {
  const sources = sourceBlocks(output);
  let usedFallback = false;
  const blocks = sources.map((source) => {
    const candidate = output.deliveryGuide?.blocks.find(
      (item) => item.kind === source.kind && item.order === source.order,
    );
    if (candidateMatches(source, candidate)) return candidate;
    usedFallback = true;
    return { ...source, segments: fallbackSegments(source.sourceText) };
  });
  const warnings = [...(output.deliveryGuide?.warnings ?? [])];
  if (usedFallback && !warnings.some((item) => item.includes("中性攻略"))) {
    warnings.push("本地规则生成的基础提示（中性攻略），并非 AI 个性化演绎；英文、型号和品牌读音请人工确认。");
  }
  return {
    ...output,
    deliveryGuide: {
      ...output.deliveryGuide,
      version: 1,
      source: usedFallback ? "rules" : output.deliveryGuide?.source,
      overallTone: output.deliveryGuide?.overallTone?.trim() || "自然、清楚、可信",
      overallPace: output.deliveryGuide?.overallPace ?? "normal",
      rehearsalNotes: output.deliveryGuide?.rehearsalNotes?.length
        ? output.deliveryGuide.rehearsalNotes.slice(0, 8)
        : ["先按实际念法慢读一遍，再按停顿完成整段录音", "重读服务于信息重点，不要逐字用力"],
      blocks,
      warnings: warnings.slice(0, 8),
    },
  };
}

export function savedRehearsalGuide(guide: ScriptDeliveryGuide | null | undefined, text: string): ScriptDeliveryGuide | null {
  const parsed = scriptDeliveryGuideSchema.safeParse(guide);
  if (!parsed.success || parsed.data.documentHash !== hashSource(text)) return null;
  const spoken = extractPrompterText(text);
  if (parsed.data.blocks.map(block => block.segments.map(segment => segment.text).join("")).join("\n").replace(/\s/g, "") !== spoken.replace(/\s/g, "")) return null;
  return parsed.data;
}

/** Read-time compatibility for every historical/edited draft; never mutate its output. */
export function guideForCurrentText(output: ScriptDraftOutput | null | undefined, text: string): ScriptDeliveryGuide | null {
  const spoken = extractPrompterText(text);
  if (!spoken) return null;
  const normalizeLines = (value: string) => value.replace(/\r\n/g, "\n").replace(/\n+/g, "\n");
  if (output && normalizeLines(spoken) === normalizeLines(structuredSpokenBody(output))) return ensureDeliveryGuide(output).deliveryGuide!;
  const source: ScriptDraftOutput = {
    pipeline: "koubo", script: spoken, plainText: text, titles: [], tags: [],
    brollCues: [], subtitleBeats: [], altHooks: [], positioning: null, timeline: [], gapsOrWarnings: [],
  };
  return ensureDeliveryGuide(source).deliveryGuide!;
}

export function buildDeliveryGuidePromptContext(output: ScriptDraftOutput): string {
  return [
    "<delivery_source>",
    "以下是最终口播块。只能按顺序切分这些原文，不得改写 text/sourceText/sourceHash/order。spokenAs 必须写实际念法；普通中文可与 text 相同，数字、英文、型号和符号需展开。无法确认的读音设 needsReview=true，不得伪造拼音。",
    JSON.stringify(sourceBlocks(output)),
    "</delivery_source>",
  ].join("\n");
}
