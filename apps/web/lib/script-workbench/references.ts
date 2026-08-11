import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import type { ScriptDraftFormat, ScriptDraftTopic } from "@video-diagnosis/shared-types";
import { topicKeywords } from "@/lib/script-workbench/catalog";

export interface ScriptReference {
  videoRecordId: string;
  description: string;
  views: number | null;
  completionRate: number | null;
  averageWatchSeconds: number | null;
  engagementRate: number | null;
  followRate: number | null;
  publishedAt: string;
}

function percentile(value: number | null, values: number[]): number | null {
  if (value == null || !Number.isFinite(value) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const belowOrEqual = sorted.filter((item) => item <= value).length;
  return belowOrEqual / sorted.length;
}

function normalizedRate(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value > 1 ? value / 100 : value;
}

function finiteValues(
  records: ImportedVideoRecord[],
  pick: (record: ImportedVideoRecord) => number | null,
): number[] {
  return records
    .map(pick)
    .filter((value): value is number => value != null && Number.isFinite(value));
}

function engagementRate(record: ImportedVideoRecord): number | null {
  if (record.views == null || record.views <= 0) return null;
  const counts = [record.likes, record.comments, record.shares].filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (!counts.length) return null;
  return counts.reduce((sum, value) => sum + value, 0) / record.views;
}

function followRate(record: ImportedVideoRecord): number | null {
  if (
    record.views == null ||
    record.views <= 0 ||
    record.follows == null ||
    !Number.isFinite(record.follows)
  ) {
    return null;
  }
  return record.follows / record.views;
}

function publishedTimestamp(record: ImportedVideoRecord): number | null {
  const value = Date.parse(record.publishedAt);
  return Number.isFinite(value) ? value : null;
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
  const views = finiteValues(records, (record) => record.views);
  const completionRates = finiteValues(records, (record) =>
    normalizedRate(record.completionRate),
  );
  const watchSeconds = finiteValues(records, (record) => record.averageWatchSeconds);
  const engagementRates = finiteValues(records, engagementRate);
  const followRates = finiteValues(records, followRate);
  const publishedTimes = finiteValues(records, publishedTimestamp);

  const scored = records
    .map((record) => {
      const text = `${record.description ?? ""} ${record.normalizedDescription ?? ""}`;
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword)) score += 2;
      }
      let performanceTotal = 0;
      let performanceWeight = 0;
      const addPerformance = (
        value: number | null,
        values: number[],
        weight: number,
      ) => {
        const rank = percentile(value, values);
        if (rank == null) return;
        performanceTotal += rank * weight;
        performanceWeight += weight;
      };
      addPerformance(record.views, views, 2);
      addPerformance(
        normalizedRate(record.completionRate),
        completionRates,
        2.5,
      );
      addPerformance(record.averageWatchSeconds, watchSeconds, 1.5);
      const engagement = engagementRate(record);
      addPerformance(engagement, engagementRates, 1.5);
      const follows = followRate(record);
      addPerformance(follows, followRates, 1.5);
      if (performanceWeight > 0) {
        score += (performanceTotal / performanceWeight) * 6;
      }
      const recency = publishedTimestamp(record);
      const recencyRank = percentile(recency, publishedTimes);
      if (recencyRank != null) score += recencyRank;
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
    completionRate: normalizedRate(record.completionRate),
    averageWatchSeconds: record.averageWatchSeconds,
    engagementRate: engagementRate(record),
    followRate: followRate(record),
    publishedAt: record.publishedAt,
  }));
}

export function formatReferencesForPrompt(refs: ScriptReference[]): string[] {
  return refs.map((ref) => {
    const play = ref.views == null ? "播放未知" : `播放 ${ref.views}`;
    const finish =
      ref.completionRate == null
        ? "完播未知"
        : `完播 ${(ref.completionRate * 100).toFixed(1)}%`;
    const watch =
      ref.averageWatchSeconds == null
        ? "平均观看未知"
        : `平均观看 ${ref.averageWatchSeconds.toFixed(1)} 秒`;
    const engagement =
      ref.engagementRate == null
        ? "互动率未知"
        : `互动率 ${(ref.engagementRate * 100).toFixed(2)}%`;
    const follows =
      ref.followRate == null
        ? "关注率未知"
        : `关注率 ${(ref.followRate * 100).toFixed(2)}%`;
    return `账号历史适配信号：${ref.description}（${play}，${finish}，${watch}，${engagement}，${follows}，发布 ${ref.publishedAt.slice(0, 10)}）`;
  });
}
