import type { DraftCoverBriefOptions } from "@video-diagnosis/shared-types";

export const coverBriefStyleChoices = [
  { value: "site_real", label: "实景工地" },
  { value: "premium_delivery", label: "高端交付" },
  { value: "tech_blueprint", label: "科技蓝图" },
  { value: "bold_feed", label: "大字冲击" },
] as const;

export const coverBriefThemeChoices = [
  { value: "white_outline", label: "白字深描边" },
  { value: "warm_gold", label: "暖金点缀" },
  { value: "blue_orange_green", label: "蓝橙绿胶囊" },
  { value: "dark_glass", label: "深色玻璃底" },
] as const;

export const coverBriefAspectChoices = [
  { value: "3:4", label: "3:4" },
  { value: "9:16", label: "9:16" },
] as const;

export const coverBriefMoodChoices = [
  { value: "trust", label: "安心可信" },
  { value: "premium", label: "专业克制" },
  { value: "pain_point", label: "痛点共鸣" },
] as const;

export const coverBriefOverlayChoices = [
  { value: "light", label: "轻压暗" },
  { value: "medium", label: "中等暗角" },
  { value: "strong", label: "强对比" },
] as const;

function readOptional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

/** 预设或自定义文案均可；空则 null。 */
export function parseCoverBriefOptionsFromForm(
  formData: FormData,
): DraftCoverBriefOptions {
  return {
    style: readOptional(formData, "style"),
    themeColor: readOptional(formData, "themeColor"),
    aspectRatio: readOptional(formData, "aspectRatio"),
    mood: readOptional(formData, "mood"),
    overlay: readOptional(formData, "overlay"),
  };
}
