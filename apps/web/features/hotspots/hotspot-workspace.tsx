"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  HotspotCluster,
  HotspotSnapshot,
  HotspotTopicCard,
  TrackId,
} from "@video-diagnosis/shared-types";
import { hotspotSnapshotSchema } from "@video-diagnosis/shared-types";
import { Badge, Button, Card } from "@/components/ui";
import { allTrackIds, trackLabel } from "@/lib/tracks/dictionary";

const SHOOTABILITY_LABELS = {
  low: "难拍",
  medium: "中等",
  high: "易拍",
} as const;

const SOURCE_STATUS_LABELS = {
  ok: "成功",
  failed: "失败",
  skipped: "跳过",
} as const;

const CONFIDENCE_LABELS = {
  low: "低置信度",
  medium: "中置信度",
  high: "高置信度",
} as const;

const CONFIDENCE_TONES = {
  low: "warning",
  medium: "info",
  high: "success",
} as const;

function formatFetchedAt(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("zh-CN", { hour12: false });
}

function buildScriptHref(
  snapshot: HotspotSnapshot,
  cluster: HotspotCluster,
  card?: HotspotTopicCard,
): string {
  const params = new URLSearchParams({
    hotspotSnapshot: snapshot.id,
    hotspotCluster: cluster.id,
    hotspotTitle: card?.title ?? cluster.headline,
    idea: card?.hook ?? cluster.headline,
  });
  if (card?.id) params.set("hotspotCard", card.id);
  return `/scripts/new?${params.toString()}`;
}

export function HotspotWorkspace() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<HotspotSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [trackFilter, setTrackFilter] = useState<TrackId | "all">("all");
  const [autoRefreshed, setAutoRefreshed] = useState(false);
  const [savingTopic, setSavingTopic] = useState("");
  const [savedTopics, setSavedTopics] = useState<string[]>([]);
  const [topicMessage, setTopicMessage] = useState("");

  async function saveTopic(card: HotspotTopicCard) {
    if (!snapshot || savingTopic || savedTopics.includes(card.id)) return;
    setSavingTopic(card.id);
    setTopicMessage("");
    try {
      const links = snapshot.items.filter((item) => card.sourceIds.includes(item.id)).map((item) => item.url);
      const response = await fetch("/api/creator-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveTopic", subject: card.title.slice(0, 180), note: [card.hook, card.whyNow, `热点快照：${snapshot.id}`, ...links].join("\n").slice(0, 3000), source: "热点", planDate: "", status: "idea" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "收藏失败");
      setSavedTopics((current) => [...current, card.id]);
      setTopicMessage("已保存到选题池，可在创作资料中排期。");
    } catch (saveError) {
      setTopicMessage(saveError instanceof Error ? saveError.message : "收藏失败，请重试");
    } finally {
      setSavingTopic("");
    }
  }

  const applySnapshot = useCallback((next: HotspotSnapshot, nextStale: boolean) => {
    setSnapshot(next);
    setStale(nextStale);
    setSelectedClusterId((current) => {
      if (current && next.clusters.some((cluster) => cluster.id === current)) {
        return current;
      }
      return next.clusters[0]?.id ?? "";
    });
  }, []);

  const fetchLatest = useCallback(async () => {
    const response = await fetch("/api/hotspots/latest");
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || `读取失败（${response.status}）`);
    }
    const parsed = body.snapshot
      ? hotspotSnapshotSchema.safeParse(body.snapshot)
      : null;
    if (body.snapshot && !parsed?.success) {
      throw new Error("热点快照格式无效");
    }
    return {
      snapshot: parsed?.success ? parsed.data : null,
      expired: Boolean(body.expired),
      refreshDue: Boolean(body.refreshDue),
      stale: Boolean(body.stale),
    };
  }, []);

  const runRefresh = useCallback(
    async (forceRefresh: boolean) => {
      setRefreshing(true);
      setError("");
      try {
        const response = await fetch("/api/hotspots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRefresh }),
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || `抓取失败（${response.status}）`);
        }
        const parsed = hotspotSnapshotSchema.safeParse(body.snapshot);
        if (!parsed.success) throw new Error("热点快照格式无效");
        applySnapshot(parsed.data, Boolean(body.stale));
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "热点抓取失败，请稍后重试",
        );
      } finally {
        setRefreshing(false);
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const latest = await fetchLatest();
        if (cancelled) return;
        if (latest.snapshot) {
          applySnapshot(latest.snapshot, latest.stale);
        }
        if (!latest.snapshot || latest.expired || latest.refreshDue) {
          setAutoRefreshed(true);
          await runRefresh(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "加载热点失败",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySnapshot, fetchLatest, runRefresh]);

  const filteredClusters = useMemo(() => {
    if (!snapshot) return [];
    const clusters =
      trackFilter === "all"
        ? snapshot.clusters
        : snapshot.clusters.filter((cluster) =>
            cluster.trackIds.includes(trackFilter),
          );
    return [...clusters].sort((a, b) => b.heat - a.heat);
  }, [snapshot, trackFilter]);

  const selectedCluster = useMemo(
    () =>
      filteredClusters.find((cluster) => cluster.id === selectedClusterId) ??
      filteredClusters[0] ??
      null,
    [filteredClusters, selectedClusterId],
  );

  const clusterCards = useMemo(() => {
    if (!snapshot || !selectedCluster) return [];
    return snapshot.topicCards.filter(
      (card) => card.clusterId === selectedCluster.id,
    );
  }, [snapshot, selectedCluster]);

  const clusterItems = useMemo(() => {
    if (!snapshot || !selectedCluster) return [];
    const ids = new Set(selectedCluster.itemIds);
    return snapshot.items.filter((item) => ids.has(item.id));
  }, [snapshot, selectedCluster]);

  const sourceSummary = useMemo(() => {
    if (!snapshot) return null;
    const ok = snapshot.sourceReports.filter((r) => r.status === "ok").length;
    const failed = snapshot.sourceReports.filter(
      (r) => r.status === "failed",
    ).length;
    const skipped = snapshot.sourceReports.filter(
      (r) => r.status === "skipped",
    ).length;
    return { ok, failed, skipped, total: snapshot.sourceReports.length };
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-[#66736c]">
        <Loader2 className="animate-spin" size={16} />
        正在读取热点快照…
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">
            {snapshot
              ? `上次抓取：${formatFetchedAt(snapshot.fetchedAt)}`
              : "尚无热点快照"}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#66736c]">
            {stale ? <Badge tone="warning">数据可能已过期</Badge> : null}
            {autoRefreshed && refreshing ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="animate-spin" size={12} />
                过期后正在自动刷新…
              </span>
            ) : null}
            {sourceSummary ? (
              <span>
                源 {sourceSummary.ok}/{sourceSummary.total} 成功
                {sourceSummary.failed ? `，${sourceSummary.failed} 失败` : ""}
                {sourceSummary.skipped ? `，${sourceSummary.skipped} 跳过` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings">
            <Button type="button" variant="secondary" size="sm">
              热点源设置
            </Button>
          </Link>
          <Button
            type="button"
            size="sm"
            disabled={refreshing}
            onClick={() => void runRefresh(true)}
          >
            {refreshing ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
            手动刷新
          </Button>
        </div>
      </Card>

      {error ? (
        <Card className="flex items-start gap-2 border-coral/30 bg-[#fff6f4] p-4 text-sm text-coral">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </Card>
      ) : null}

      {snapshot?.limitations.length ? (
        <Card className="space-y-1 p-4 text-sm text-[#52615a]">
          {snapshot.limitations.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            赛道筛选
          </span>
          <Button
            type="button"
            size="sm"
            variant={trackFilter === "all" ? "primary" : "secondary"}
            onClick={() => setTrackFilter("all")}
          >
            全部
          </Button>
          {allTrackIds().map((trackId) => (
            <Button
              key={trackId}
              type="button"
              size="sm"
              variant={trackFilter === trackId ? "primary" : "secondary"}
              onClick={() => setTrackFilter(trackId)}
            >
              {trackLabel(trackId)}
            </Button>
          ))}
        </div>
      </Card>

      {!snapshot || filteredClusters.length === 0 ? (
        <Card className="p-6 text-sm text-[#66736c]">
          {snapshot?.items.length
            ? "当前筛选下没有匹配的热点簇，请换赛道或调整设置。"
            : "暂无热点条目。请检查设置中的源是否可用，或稍后手动刷新。"}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-bold text-ink">热点簇</h3>
            <ul className="space-y-2">
              {filteredClusters.map((cluster) => {
                const active = cluster.id === selectedCluster?.id;
                return (
                  <li key={cluster.id}>
                    <button
                      type="button"
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-pine bg-[#f1f8f4]"
                          : "border-line bg-white hover:bg-fog"
                      }`}
                      onClick={() => setSelectedClusterId(cluster.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">
                          {cluster.headline}
                        </span>
                        <Badge tone="neutral">热度 {cluster.heat}</Badge>
                        <Badge tone={CONFIDENCE_TONES[cluster.confidence]}>
                          {CONFIDENCE_LABELS[cluster.confidence]}
                        </Badge>
                        <Badge tone="neutral">{cluster.sourceCount} 源</Badge>
                      </div>
                      <p className="mt-1 text-xs text-[#66736c]">
                        {cluster.trackIds.map((id) => trackLabel(id)).join("、") ||
                          "未标注赛道"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="space-y-4">
            {selectedCluster ? (
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      {selectedCluster.headline}
                    </h3>
                    <p className="mt-1 text-xs text-[#66736c]">
                      {clusterItems.length} 条相关报道
                    </p>
                    <p className="mt-1 text-xs text-[#66736c]">
                      来源分 {selectedCluster.scoreBreakdown.sourceDiversity} ·
                      条目分 {selectedCluster.scoreBreakdown.itemVolume} · 新鲜度分{" "}
                      {selectedCluster.scoreBreakdown.recency} · 有日期{" "}
                      {Math.round(
                        selectedCluster.scoreBreakdown.dateConfidence * 100,
                      )}
                      %
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      router.push(
                        buildScriptHref(snapshot, selectedCluster),
                      )
                    }
                  >
                    <Sparkles size={14} />
                    按此热点写脚本
                  </Button>
                </div>

                <ul className="space-y-2 text-sm">
                  {clusterItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-line bg-white p-3"
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-ink hover:text-pine hover:underline"
                      >
                        {item.title}
                        <ExternalLink size={12} />
                      </a>
                      <p className="mt-1 text-xs text-[#66736c]">
                        {item.sourceName}
                        {item.publishedAt
                          ? ` · ${formatFetchedAt(item.publishedAt)}`
                          : ""}
                      </p>
                      {item.summary ? (
                        <p className="mt-2 text-xs leading-5 text-[#52615a]">
                          {item.summary}
                        </p>
                      ) : null}
                      {item.matchedTerms.length ? (
                        <p className="mt-2 text-xs text-[#66736c]">
                          命中词：{item.matchedTerms.join("、")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {clusterCards.length ? (
              <Card className="space-y-3 p-4">
                <h3 className="text-sm font-bold text-ink">选题建议</h3>
                {topicMessage ? <p role="status" className="text-xs text-[#52615a]">{topicMessage} <Link href="/creator-studio" className="underline">查看选题池</Link></p> : null}
                {clusterCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-xl border border-line bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-ink">{card.title}</h4>
                      <Badge tone="neutral">
                        {SHOOTABILITY_LABELS[card.shootability]}
                      </Badge>
                      <Badge tone="neutral">{card.timeWindowDays} 天窗口</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[#52615a]">{card.hook}</p>
                    <p className="mt-2 text-xs text-[#66736c]">
                      为什么现在做：{card.whyNow}
                    </p>
                    <p className="mt-1 text-xs text-[#66736c]">
                      受众：{card.targetAudience}
                    </p>
                    {card.requiredEvidence.length ? (
                      <p className="mt-2 text-xs text-[#66736c]">
                        所需证据：{card.requiredEvidence.join("、")}
                      </p>
                    ) : null}
                    {card.risks.length ? (
                      <p className="mt-1 text-xs text-coral">
                        风险：{card.risks.join("、")}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          router.push(
                            buildScriptHref(snapshot, selectedCluster!, card),
                          )
                        }
                      >
                        用这条选题写脚本
                      </Button>
                      <Button type="button" size="sm" variant="secondary" disabled={Boolean(savingTopic) || savedTopics.includes(card.id)} onClick={() => void saveTopic(card)}>
                        {savingTopic === card.id ? "收藏中…" : savedTopics.includes(card.id) ? "已收藏" : "收藏到选题池"}
                      </Button>
                    </div>
                  </div>
                ))}
              </Card>
            ) : selectedCluster ? (
              <Card className="p-4 text-sm text-[#66736c]">
                该热点簇暂无选题卡（可能模型未启用或生成失败）。你仍可直接按热点写脚本。
              </Card>
            ) : null}

            {snapshot.sourceReports.length ? (
              <Card className="space-y-2 p-4">
                <h3 className="text-sm font-bold text-ink">源状态</h3>
                <ul className="space-y-1 text-xs text-[#52615a]">
                  {snapshot.sourceReports.map((report) => (
                    <li key={report.sourceId} className="flex flex-wrap gap-2">
                      <span className="font-semibold text-ink">
                        {report.sourceName}
                      </span>
                      <span>{SOURCE_STATUS_LABELS[report.status]}</span>
                      {report.status === "ok" ? (
                        <span>{report.itemCount} 条</span>
                      ) : null}
                      {report.message ? <span>{report.message}</span> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
