import type { ImportedVideoRecord } from "@video-diagnosis/shared-types";
import {
  clipResearchText,
  stableResearchItemId,
} from "@/lib/viral-research/source-policy";
import type {
  ViralResearchItem,
  ViralResearchQuery,
} from "@/lib/viral-research/types";

type MetricKey =
  | "views"
  | "completionRate"
  | "averageWatchSeconds"
  | "engagementRate"
  | "followsPerThousandViews";

interface HistoryProfile {
  record: ImportedVideoRecord;
  percentiles: Partial<Record<MetricKey, number>>;
  availableCount: number;
  meanPercentile: number;
}

const metricLabels: Record<MetricKey, string> = {
  views: "播放量",
  completionRate: "完播率",
  averageWatchSeconds: "平均观看时长",
  engagementRate: "互动率",
  followsPerThousandViews: "千播涨粉",
};

function nonnegative(value: number | null): number | undefined {
  return value !== null && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function normalizedRate(value: number | null): number | undefined {
  const number = nonnegative(value);
  if (number === undefined) return undefined;
  return Math.min(number > 1 ? number / 100 : number, 1);
}

function metricValues(
  record: ImportedVideoRecord,
): Partial<Record<MetricKey, number>> {
  const views = nonnegative(record.views);
  const interactionValues = [record.likes, record.comments, record.shares]
    .map(nonnegative)
    .filter((value): value is number => value !== undefined);
  const follows = nonnegative(record.follows);
  return {
    ...(views !== undefined ? { views } : {}),
    ...(normalizedRate(record.completionRate) !== undefined
      ? { completionRate: normalizedRate(record.completionRate) }
      : {}),
    ...(nonnegative(record.averageWatchSeconds) !== undefined
      ? { averageWatchSeconds: nonnegative(record.averageWatchSeconds) }
      : {}),
    ...(views !== undefined && views > 0 && interactionValues.length > 0
      ? {
          engagementRate:
            interactionValues.reduce((sum, value) => sum + value, 0) / views,
        }
      : {}),
    ...(views !== undefined && views > 0 && follows !== undefined
      ? { followsPerThousandViews: (follows / views) * 1_000 }
      : {}),
  };
}

function percentile(value: number, distribution: number[]): number {
  if (distribution.length === 0) return 0;
  const below = distribution.filter((candidate) => candidate < value).length;
  const equal = distribution.filter((candidate) => candidate === value).length;
  return (below + equal * 0.5) / distribution.length;
}

function historyProfiles(records: ImportedVideoRecord[]): HistoryProfile[] {
  const valuesByRecord = new Map(
    records.map((record) => [record.id, metricValues(record)]),
  );
  const distributions = Object.fromEntries(
    (Object.keys(metricLabels) as MetricKey[]).map((metric) => [
      metric,
      [...valuesByRecord.values()]
        .map((values) => values[metric])
        .filter((value): value is number => value !== undefined),
    ]),
  ) as Record<MetricKey, number[]>;

  return records.flatMap((record) => {
    if (!record.description.trim()) return [];
    const values = valuesByRecord.get(record.id) ?? {};
    const percentiles = Object.fromEntries(
      (Object.keys(metricLabels) as MetricKey[]).flatMap((metric) => {
        const value = values[metric];
        return value === undefined
          ? []
          : [[metric, percentile(value, distributions[metric])]];
      }),
    ) as Partial<Record<MetricKey, number>>;
    const available = Object.values(percentiles).filter(
      (value): value is number => value !== undefined,
    );
    if (available.length < 2) return [];
    return [
      {
        record,
        percentiles,
        availableCount: available.length,
        meanPercentile:
          available.reduce((sum, value) => sum + value, 0) / available.length,
      },
    ];
  });
}

function rankedHistory(records: ImportedVideoRecord[]): HistoryProfile[] {
  return historyProfiles(records).sort(
    (left, right) => right.meanPercentile - left.meanPercentile,
  );
}

function percentileReasons(profile: HistoryProfile, limit = 3): string[] {
  return (Object.entries(profile.percentiles) as Array<[MetricKey, number]>)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(
      ([metric, value]) =>
        `${metricLabels[metric]}处于账号历史 P${Math.round(value * 100)}`,
    );
}

function tokens(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}#]+/gu, " ");
  const result = new Set<string>();
  for (const token of normalized.match(/[a-z0-9]{2,}|#[\p{L}\p{N}]{2,20}/gu) ?? []) {
    result.add(token.replace(/^#/u, ""));
  }
  for (const run of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    if (run.length <= 6) result.add(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      result.add(run.slice(index, index + 2));
    }
  }
  return result;
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  for (const token of left) {
    if (right.has(token)) matches += 1;
  }
  return matches / Math.max(1, Math.min(left.size, right.size));
}

export function applyOwnerAccountFit(
  items: ViralResearchItem[],
  records: ImportedVideoRecord[],
): ViralResearchItem[] {
  const ranked = rankedHistory(records);
  if (ranked.length < 3) {
    return items.map((item) => ({
      ...item,
      accountFit: {
        level: "unknown" as const,
        reasons: ["账号历史中至少 2 项指标有效的样本少于 3 条，暂不判断适配度"],
      },
    }));
  }

  const comparisons = ranked.slice(0, Math.min(8, ranked.length));
  return items.map((item) => {
    const itemTokens = tokens(`${item.title} ${item.snippet ?? ""}`);
    const best = comparisons
      .map((profile) => ({
        profile,
        overlap: overlapScore(itemTokens, tokens(profile.record.description)),
      }))
      .sort((left, right) => right.overlap - left.overlap)[0];
    const overlap = best?.overlap ?? 0;
    const level = overlap >= 0.18 ? "high" : overlap >= 0.07 ? "medium" : "low";
    const matchedDescription = clipResearchText(best?.profile.record.description, 60);
    const basis = best ? percentileReasons(best.profile) : [];
    const themeReason =
      level === "high"
        ? `与账号高表现历史主题高度接近：${matchedDescription ?? "相似内容"}`
        : level === "medium"
          ? `账号历史存在可迁移的相近主题：${matchedDescription ?? "相似内容"}`
          : "账号高表现历史中未发现明显同主题样本，建议小成本验证";
    return {
      ...item,
      accountFit: { level, reasons: [themeReason, ...basis].slice(0, 4) },
    };
  });
}

function historyTrendSignal(record: ImportedVideoRecord): string {
  const parts: string[] = [];
  if (nonnegative(record.views) !== undefined) parts.push(`播放 ${record.views}`);
  const completionRate = normalizedRate(record.completionRate);
  if (completionRate !== undefined) {
    parts.push(`完播率 ${(completionRate * 100).toFixed(1)}%`);
  }
  if (nonnegative(record.averageWatchSeconds) !== undefined) {
    parts.push(`平均观看 ${record.averageWatchSeconds} 秒`);
  }
  if (nonnegative(record.likes) !== undefined) parts.push(`点赞 ${record.likes}`);
  return parts.length ? `账号历史实绩：${parts.join("，")}` : "账号历史样本";
}

export function selectOwnedHistoryItems(
  query: ViralResearchQuery,
  records: ImportedVideoRecord[],
  limit = 2,
): ViralResearchItem[] {
  const queryTokens = tokens(query.topic);
  return rankedHistory(records)
    .map((profile) => ({
      profile,
      relevance: overlapScore(
        queryTokens,
        tokens(profile.record.description),
      ),
    }))
    .filter(({ relevance }) => relevance >= 0.07)
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        right.profile.meanPercentile - left.profile.meanPercentile,
    )
    .slice(0, limit)
    .flatMap(({ profile, relevance }) => {
      const { record } = profile;
      const title = clipResearchText(record.description, 180);
      if (!title) return [];
      const visibleMetrics = {
        ...(nonnegative(record.views) !== undefined
          ? { views: nonnegative(record.views) }
          : {}),
        ...(nonnegative(record.likes) !== undefined
          ? { likes: nonnegative(record.likes) }
          : {}),
        ...(nonnegative(record.comments) !== undefined
          ? { comments: nonnegative(record.comments) }
          : {}),
        ...(nonnegative(record.shares) !== undefined
          ? { shares: nonnegative(record.shares) }
          : {}),
      };
      return [
        {
          id: stableResearchItemId("owned_history", record.id),
          sourceType: "owned_history" as const,
          title,
          site: "本账号历史",
          author: "本账号",
          publishedAt: record.publishedAt,
          evidenceLevel: "account_history" as const,
          ...(Object.keys(visibleMetrics).length ? { visibleMetrics } : {}),
          relevanceReasons: [
            "与本次主题存在关键词交集",
          ],
          trendSignal: historyTrendSignal(record),
          accountFit: {
            level: relevance >= 0.18 ? ("high" as const) : ("medium" as const),
            reasons: [
              "来自当前 owner 的账号历史数据",
              ...percentileReasons(profile),
            ].slice(0, 4),
          },
        },
      ];
    });
}
