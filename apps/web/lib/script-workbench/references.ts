import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import type { ScriptDraftFormat, ScriptDraftTopic } from "@video-diagnosis/shared-types";
import { topicKeywords } from "@/lib/script-workbench/catalog";

export interface ScriptReference {
  videoRecordId: string;
  description: string;
  views: number | null;
  completionRate: number | null;
}

/** 仅保留属于该 owner 的导入视频，避免跨租户参考泄漏 */
export function recordsOwnedBy(
  records: ImportedVideoRecord[],
  imports: Array<{ id: string; ownerId: string }>,
  ownerId: string,
): ImportedVideoRecord[] {
  const ownedImportIds = new Set(
    imports.filter((item) => item.ownerId === ownerId).map((item) => item.id),
  );
  return records.filter((record) => ownedImportIds.has(record.importId));
}

export function findScriptReferences(
  records: ImportedVideoRecord[],
  format: ScriptDraftFormat,
  topic: ScriptDraftTopic | null,
  idea: string,
  limit = 3,
): ScriptReference[] {
  if (format === "vlog" && !topic) return [];
  const keywords = [
    ...topicKeywords(topic),
    ...idea
      .split(/[\s,，、|/]+/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 6),
  ];
  if (!keywords.length) return [];

  const scored = records
    .map((record) => {
      const text = `${record.description ?? ""} ${record.normalizedDescription ?? ""}`;
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword)) score += 2;
      }
      if (record.views) score += Math.min(3, Math.log10(record.views + 1));
      return { record, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.record.id.localeCompare(b.record.id);
    })
    .slice(0, limit);

  return scored.map(({ record }) => ({
    videoRecordId: record.id,
    description: (record.description ?? "").split("\n")[0]?.slice(0, 80) ?? "",
    views: record.views,
    completionRate: record.completionRate,
  }));
}

export function formatReferencesForPrompt(refs: ScriptReference[]): string[] {
  return refs.map((ref) => {
    const play = ref.views == null ? "播放未知" : `播放 ${ref.views}`;
    const finish =
      ref.completionRate == null
        ? "完播未知"
        : `完播 ${(ref.completionRate * 100).toFixed(1)}%`;
    return `${ref.description}（${play}，${finish}）`;
  });
}
