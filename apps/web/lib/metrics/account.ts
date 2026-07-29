import type {
  ImportedVideoRecord,
  SampleConfidence,
} from "@video-diagnosis/shared-types";

export function safeRate(
  numerator: number | null,
  views: number | null,
): number | null {
  if (views === null || views <= 0 || numerator === null) return null;
  return numerator / views;
}

function quantile(values: Array<number | null>, q: number): number | null {
  const sorted = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] ?? null;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

export function median(values: Array<number | null>): number | null {
  return quantile(values, 0.5);
}

export interface MetricDistribution {
  q1: number | null;
  q2: number | null;
  q3: number | null;
}

export interface AccountBaseline {
  all: Record<string, MetricDistribution>;
  recent10: Record<string, number | null>;
}

function recordMetrics(record: ImportedVideoRecord) {
  return {
    views: record.views,
    completionRate: record.completionRate,
    averageWatchSeconds: record.averageWatchSeconds,
    likeRate: safeRate(record.likes, record.views),
    commentRate: safeRate(record.comments, record.views),
    shareRate: safeRate(record.shares, record.views),
    followRate: safeRate(record.follows, record.views),
  };
}

export function calculateAccountBaseline(
  records: ImportedVideoRecord[],
): AccountBaseline {
  const sorted = [...records].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
      a.spreadsheetRow - b.spreadsheetRow,
  );
  const metrics = records.map(recordMetrics);
  const recentMetrics = sorted.slice(0, 10).map(recordMetrics);
  const keys = Object.keys(metrics[0] ?? recordMetrics(records[0] ?? ({
    views: null,
    completionRate: null,
    averageWatchSeconds: null,
    likes: null,
    comments: null,
    shares: null,
    follows: null,
  } as ImportedVideoRecord)));
  return {
    all: Object.fromEntries(
      keys.map((key) => {
        const values = metrics.map(
          (item) => item[key as keyof typeof item] as number | null,
        );
        return [
          key,
          {
            q1: quantile(values, 0.25),
            q2: quantile(values, 0.5),
            q3: quantile(values, 0.75),
          },
        ];
      }),
    ),
    recent10: Object.fromEntries(
      keys.map((key) => [
        key,
        median(
          recentMetrics.map(
            (item) => item[key as keyof typeof item] as number | null,
          ),
        ),
      ]),
    ),
  };
}

export function sampleConfidence(
  views: number | null,
  baseline: AccountBaseline,
): SampleConfidence {
  if (views === null) return "low";
  const distribution = baseline.all.views;
  if (!distribution || distribution.q1 === null || distribution.q3 === null) {
    return "low";
  }
  if (views < distribution.q1) return "low";
  if (views > distribution.q3) return "high";
  return "medium";
}

export function sortByPublishedAt(
  records: ImportedVideoRecord[],
): ImportedVideoRecord[] {
  return [...records].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
      a.spreadsheetRow - b.spreadsheetRow,
  );
}
