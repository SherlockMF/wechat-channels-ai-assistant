const PRESET_RECENT = new Set(["5", "10", "20", "all"]);

export function normalizeRecentRange(value: string | null | undefined): string {
  if (!value) return "5";
  if (PRESET_RECENT.has(value)) return value;
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return String(n);
  return "5";
}
