import { contentPlatformSchema } from "@video-diagnosis/shared-types";
import type { ContentPlatform } from "@video-diagnosis/shared-types";
import {
  contentProfileSchema,
  type ContentProfileSettings,
} from "@/lib/settings/schema";

function compactUnique(values: unknown, max: number): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  )].slice(0, max);
}
function normalizePlatforms(values: unknown): ContentPlatform[] {
  if (!Array.isArray(values)) return [];
  const parsed = values.flatMap((value) => {
    const result = contentPlatformSchema.safeParse(value);
    return result.success ? [result.data] : [];
  });
  return [...new Set(parsed)].slice(0, 4);
}

/**
 * Treat persisted/user-entered profile text as data: trim scalar fields,
 * remove blank/duplicate lists and fall back to a complete compatible profile.
 */
export function normalizeContentProfile(
  input?: Partial<ContentProfileSettings> | null,
): ContentProfileSettings {
  const defaults = contentProfileSchema.parse({});
  const source = input ?? {};
  const audiences = compactUnique(source.audiences, 12);
  const themeKeywords = compactUnique(source.themeKeywords, 80);
  const defaultPlatforms = normalizePlatforms(source.defaultPlatforms);

  return contentProfileSchema.parse({
    accountName: source.accountName?.trim() || defaults.accountName,
    brandName: source.brandName?.trim() || defaults.brandName,
    region: source.region?.trim() || defaults.region,
    positioning: source.positioning?.trim() || defaults.positioning,
    audiences: audiences.length ? audiences : defaults.audiences,
    toneGuide: source.toneGuide?.trim() || defaults.toneGuide,
    ctaPolicy: source.ctaPolicy?.trim() || defaults.ctaPolicy,
    themeKeywords: themeKeywords.length
      ? themeKeywords
      : defaults.themeKeywords,
    defaultPlatforms: defaultPlatforms.length
      ? defaultPlatforms
      : defaults.defaultPlatforms,
    otherPlatformName: source.otherPlatformName?.trim() || "",
  });
}
