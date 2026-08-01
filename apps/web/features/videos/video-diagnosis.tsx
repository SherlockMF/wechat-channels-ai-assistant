"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  FileText,
  Gauge,
  PlayCircle,
  Scissors,
  Volume2,
} from "lucide-react";
import type { DiagnosisResult, ImportedVideoRecord, VideoAsset } from "@video-diagnosis/shared-types";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { AnalysisJob, AnalysisResultEntry } from "@/lib/data/types";

interface VideoPayload {
  record: ImportedVideoRecord;
  asset: (VideoAsset & { previewUrl: string }) | null;
  job: AnalysisJob | null;
  result: AnalysisResultEntry | null;
  baseline: {
    all: Record<string, { q1: number | null; q2: number | null; q3: number | null }>;
  };
  analysisMode: "local_rule" | "codex_multimodal" | "worker";
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

const confidenceLabel = { low: "低", medium: "中", high: "高" } as const;
const categoryLabel: Record<string, string> = {
  hook: "开头钩子",
  copy: "文案表达",
  visual: "视觉呈现",
  subtitle: "字幕信息",
  pacing: "内容节奏",
  audio: "声音设计",
  structure: "内容结构",
};
const severityLabel = { low: "低", medium: "中", high: "高" } as const;
const metricLabel: Record<string, string> = {
  completion_rate: "完播率",
  average_watch_seconds: "平均观看时长",
  like_rate: "点赞率",
  comment_rate: "评论率",
  share_rate: "分享率",
  follow_rate: "关注率",
};

const hookTypeLabel: Record<string, string> = {
  result: "结果型",
  pain_point: "痛点型",
  suspense: "悬念型",
};
const actionLabel: Record<string, string> = {
  delete: "删除",
  trim: "压缩",
  replace: "替换",
  move_forward: "前移",
  speed_up: "加速",
  add_subtitle: "补充字幕",
  change_audio: "调整声音",
  reshoot: "补拍",
  keep: "保留",
};

export function VideoDiagnosis({
  videoId,
  returnTo,
}: {
  videoId: string;
  returnTo: string;
}) {
  const [payload, setPayload] = useState<VideoPayload | null>(null);
  const [error, setError] = useState("");
  const [neighbors, setNeighbors] = useState<{
    position: number;
    total: number;
    previous: ImportedVideoRecord | null;
    next: ImportedVideoRecord | null;
  } | null>(null);
  const player = useRef<HTMLVideoElement>(null);
  const latestVideoRequest = useRef(0);

  async function loadVideo(
    requestId = ++latestVideoRequest.current,
  ) {
    try {
      const response = await fetch(`/api/videos/${videoId}`);
      if (!response.ok) throw new Error(`视频诊断读取失败（${response.status}）`);
      const nextPayload = await response.json();
      if (requestId !== latestVideoRequest.current) return;
      setPayload(nextPayload);
      setError("");
    } catch (loadError) {
      if (requestId !== latestVideoRequest.current) return;
      setError(loadError instanceof Error ? loadError.message : "视频诊断读取失败");
    }
  }

  useEffect(() => {
    const requestId = ++latestVideoRequest.current;
    setPayload(null);
    setNeighbors(null);
    setError("");
    void loadVideo(requestId);
    void fetch("/api/analysis")
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        if (requestId !== latestVideoRequest.current) return;
        if (!body?.rows) return;
        const requested = new URL(returnTo, window.location.origin).searchParams.get("recent") ?? "5";
        const scoped = requested === "all" ? body.rows : body.rows.slice(0, Number(requested));
        const index = scoped.findIndex((row: { record: ImportedVideoRecord }) => row.record.id === videoId);
        if (index < 0) return;
        setNeighbors({
          position: index + 1,
          total: scoped.length,
          previous: scoped[index - 1]?.record ?? null,
          next: scoped[index + 1]?.record ?? null,
        });
      })
      .catch(() => {
        if (requestId === latestVideoRequest.current) setNeighbors(null);
      });
    return () => {
      if (requestId === latestVideoRequest.current) latestVideoRequest.current += 1;
    };
  }, [returnTo, videoId]);

  const chartData = useMemo(() => {
    if (!payload) return [];
    const distribution = payload.baseline.all.completionRate;
    return [
      { name: "Q1", value: (distribution?.q1 ?? 0) * 100 },
      { name: "当前", value: (payload.record.completionRate ?? 0) * 100 },
      { name: "中位", value: (distribution?.q2 ?? 0) * 100 },
      { name: "Q3", value: (distribution?.q3 ?? 0) * 100 },
    ];
  }, [payload]);

  function seek(second: number) {
    if (!player.current) return;
    player.current.currentTime = second;
    void player.current.play();
  }

  if (!payload) {
    return error ? (
      <Card className="p-6">
        <EmptyState title="视频诊断读取失败" description={error} />
        <button
          onClick={() => void loadVideo()}
          className="mx-auto mt-4 block rounded-lg bg-pine px-4 py-2 text-sm font-bold text-white"
        >
          重新加载
        </button>
      </Card>
    ) : (
      <Card className="min-h-96 animate-pulse bg-white" />
    );
  }
  const result: DiagnosisResult | null = payload.result?.result ?? null;

  return (
    <div className="space-y-4">
      {neighbors && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <span className="font-semibold text-[#66736c]">
            当前范围第 {neighbors.position}/{neighbors.total} 条
          </span>
          <div className="flex gap-2">
            {neighbors.previous ? (
              <Link
                href={`/videos/${neighbors.previous.id}?returnTo=${encodeURIComponent(returnTo)}`}
                className="rounded-lg border border-line px-3 py-1.5 font-bold text-pine hover:bg-fog"
              >
                上一条
              </Link>
            ) : <span className="rounded-lg border border-line px-3 py-1.5 text-[#9aa49e]">已是第一条</span>}
            {neighbors.next ? (
              <Link
                href={`/videos/${neighbors.next.id}?returnTo=${encodeURIComponent(returnTo)}`}
                className="rounded-lg border border-line px-3 py-1.5 font-bold text-pine hover:bg-fog"
              >
                下一条
              </Link>
            ) : <span className="rounded-lg border border-line px-3 py-1.5 text-[#9aa49e]">已是最后一条</span>}
          </div>
        </div>
      )}
      {payload.result?.editedMarkdown && (
        <Card className="border-[#dfc89f] bg-[#fff9ef] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText size={18} className="mt-0.5 shrink-0 text-amber" />
              <div>
                <p className="font-bold">交付报告已人工修改</p>
                <p className="mt-1 text-sm text-[#75664f]">
                  下方保留原始结构化诊断；剪辑执行与对外分享请以可编辑报告为准。
                </p>
              </div>
            </div>
            <Link href={`/videos/${videoId}/report?returnTo=${encodeURIComponent(returnTo)}`} className="text-sm font-bold text-pine hover:underline">
              查看人工版本
            </Link>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(560px,1.08fr)]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="aspect-video bg-[#101412]">
            {payload.asset?.previewUrl ? (
              <video
                ref={player}
                src={payload.asset.previewUrl}
                controls
                preload="metadata"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-white/60">
                视频文件不可用
              </div>
            )}
          </div>
          <div className="border-t border-line p-5">
            <p className="line-clamp-2 font-display text-xl font-semibold leading-7">
              {payload.record.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={payload.analysisMode === "local_rule" ? "warning" : "info"}>
                {payload.analysisMode === "local_rule"
                  ? "本地规则诊断"
                  : payload.analysisMode === "codex_multimodal"
                    ? "Codex 多模态诊断"
                    : "Worker 内容诊断"}
              </Badge>
              <Badge>
                {new Date(payload.record.publishedAt).toLocaleDateString("zh-CN")}
              </Badge>
              {payload.asset?.durationSeconds && (
                <Badge>{payload.asset.durationSeconds.toFixed(1)} 秒</Badge>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Gauge size={17} className="text-pine" />
            <h2 className="font-display text-xl font-semibold">数据事实</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["完播率", formatPercent(payload.record.completionRate)],
              ["平均观看", payload.record.averageWatchSeconds !== null ? `${payload.record.averageWatchSeconds.toFixed(1)}s` : "—"],
              ["播放量", payload.record.views?.toLocaleString() ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-fog p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#7b8880]">{label}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="28%">
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis axisLine={false} tickLine={false} fontSize={10} unit="%" />
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.name === "当前" ? "#c97718" : "#1e6650"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {result && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8880]">完整诊断事实</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#5d6b64]">
                {result.dataAssessment.facts.map((fact) => (
                  <li key={fact}>· {fact}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 size={17} className="text-pine" />
            <h2 className="font-display text-xl font-semibold">时间轴</h2>
          </div>
          <div className="space-y-2">
            {(result?.primaryProblems ?? []).map((problem) => (
              <button
                key={`${problem.startSecond}-${problem.category}`}
                onClick={() => seek(problem.startSecond)}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-[#fafbfa] p-4 text-left transition hover:border-pine hover:bg-[#f3f7f4]"
              >
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wider text-amber">
                    {problem.startSecond.toFixed(1)}–{problem.endSecond.toFixed(1)} 秒
                  </span>
                  <span className="mt-1 block text-sm font-semibold">
                    {problem.inference}
                  </span>
                </span>
                <PlayCircle size={19} className="shrink-0 text-pine" />
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        {!result ? (
          <Card className="p-6">
            <EmptyState
              title="诊断尚未完成"
              description={`当前任务状态：${payload.job?.currentStep ?? "未创建"}`}
            />
          </Card>
        ) : (
          <>
            <Card className="border-[#c7d9ce] bg-[#f8fbf9] p-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-pine">
                  Executive Summary
                </p>
                <Badge tone="neutral">
                  样本置信度：{confidenceLabel[result.dataAssessment.sampleConfidence]}
                </Badge>
              </div>
              <p className="font-display text-2xl font-semibold leading-9">
                {result.executiveSummary}
              </p>
            </Card>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle size={18} className="text-amber" />
                <h2 className="font-display text-xl font-semibold">
                  疑似问题区间
                </h2>
              </div>
              <div className="space-y-3">
                {result.primaryProblems.map((problem, index) => (
                  <Card key={`${problem.category}-${index}`} className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-line bg-[#fafbfa] px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                          {index + 1}
                        </span>
                        <span className="text-sm font-bold">{categoryLabel[problem.category] ?? problem.category}</span>
                      </div>
                        <Badge tone={problem.severity === "high" ? "danger" : "neutral"}>
                          {severityLabel[problem.severity]}优先级
                        </Badge>
                      <button
                        onClick={() => seek(problem.startSecond)}
                        className="font-mono text-xs font-bold text-pine"
                      >
                        {problem.startSecond.toFixed(1)}–{problem.endSecond.toFixed(1)}s
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7f8c84]">
                          事实 / 特征
                        </p>
                        <ul className="mt-2 space-y-2 text-sm leading-5 text-[#58665f]">
                          {[...problem.dataEvidence, ...problem.contentEvidence].map((item) => (
                            <li key={item}>· {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-[#ead5b5] bg-[#fff8ed] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a641f]">
                          合理推断
                        </p>
                        <p className="mt-2 text-sm leading-6">{problem.inference}</p>
                        <div className="mt-4 border-t border-[#ead5b5] pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a641f]">
                            建议动作
                          </p>
                          <p className="mt-1 text-sm leading-6">{problem.recommendation}</p>
                          <p className="mt-2 text-xs text-[#806a4c]">
                            目标：{metricLabel[problem.expectedMetric]} · 置信度：{confidenceLabel[problem.confidence]}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-6 py-5">
                <Scissors size={18} className="text-pine" />
                <h2 className="font-display text-xl font-semibold">
                  可执行修改方案
                </h2>
              </div>
              <div className="divide-y divide-line">
                {result.editingPlan.map((item, index) => (
                  <div key={`${item.startSecond}-${index}`} className="grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-[110px_1fr_auto] sm:gap-4">
                    <button
                      onClick={() => seek(item.startSecond)}
                      className="font-mono text-xs font-bold text-pine"
                    >
                      {item.startSecond.toFixed(1)}–{item.endSecond.toFixed(1)}s
                    </button>
                    <div>
                      <p className="text-sm font-bold">{actionLabel[item.action] ?? item.action}</p>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#7b8880]">原内容</p>
                      <p className="mt-1 text-sm leading-5 text-[#637169]">{item.originalContent}</p>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#7b8880]">问题</p>
                      <p className="mt-1 text-sm leading-5 text-[#637169]">{item.problem}</p>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#7b8880]">替换后</p>
                      <p className="mt-1 text-sm leading-5 text-[#637169]">
                        {item.replacementContent}
                      </p>
                      {item.sourceAsset && (
                        <p className="mt-2 text-xs font-semibold text-pine">
                          原片取材：{item.sourceAsset.sourceStartSecond.toFixed(1)}–{item.sourceAsset.sourceEndSecond.toFixed(1)} 秒
                        </p>
                      )}
                    </div>
                    {item.requiresReshoot ? (
                      <Badge tone="warning">需要补拍</Badge>
                    ) : (
                      <Badge tone="success">使用原片</Badge>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-6 py-5">
                <h2 className="font-display text-xl font-semibold">新版开头方案</h2>
                <p className="mt-1 text-xs text-[#748179]">优先使用原片素材重组，不虚构不存在的镜头。</p>
              </div>
              <div className="divide-y divide-line">
                {result.revisedOpening.map((item, index) => (
                  <div key={`${item.startSecond}-${index}`} className="grid gap-3 px-6 py-4 md:grid-cols-[90px_1fr]">
                    <button
                      onClick={() => seek(item.sourceAssetStartSecond ?? item.startSecond)}
                      className="font-mono text-xs font-bold text-pine"
                    >
                      {item.startSecond.toFixed(1)}–{item.endSecond.toFixed(1)}s
                    </button>
                    <div>
                      <p className="text-sm leading-6"><span className="font-bold">口播：</span>{item.voiceover}</p>
                      <p className="mt-1 text-sm leading-6"><span className="font-bold">字幕：</span>{item.subtitle}</p>
                      <p className="mt-1 text-sm leading-6 text-[#637169]"><span className="font-bold text-ink">画面：</span>{item.visual}</p>
                      <p className="mt-1 text-sm leading-6 text-[#637169]"><span className="font-bold text-ink">声音：</span>{item.audio}</p>
                      <p className="mt-1 text-sm leading-6 text-[#637169]"><span className="font-bold text-ink">节奏：</span>{item.editingRhythm}</p>
                      {item.sourceAssetStartSecond !== undefined && item.sourceAssetEndSecond !== undefined && (
                        <p className="mt-2 text-xs font-semibold text-pine">原片取材：{item.sourceAssetStartSecond.toFixed(1)}–{item.sourceAssetEndSecond.toFixed(1)} 秒</p>
                      )}
                      {item.requiresReshoot && <p className="mt-2 text-xs font-semibold text-amber">需要补拍</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-bold">开头备选</h3>
                <div className="mt-3 space-y-3">
                  {result.hookAlternatives.map((item) => (
                    <div key={`${item.type}-${item.voiceover}`} className="rounded-xl bg-fog p-3">
                      <Badge tone="info">{hookTypeLabel[item.type] ?? categoryLabel.hook}</Badge>
                      <p className="mt-2 text-sm leading-6"><span className="font-bold">口播：</span>{item.voiceover}</p>
                      <p className="mt-1 text-sm leading-6 text-[#637169]"><span className="font-bold text-ink">字幕：</span>{item.subtitle}</p>
                      <p className="mt-1 text-sm leading-6 text-[#637169]"><span className="font-bold text-ink">画面：</span>{item.visual}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="font-bold">明确行动建议</h3>
                <p className="mt-3 text-sm leading-6 text-[#5d6b64]">
                  {result.copySuggestions.cta}
                </p>
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-xs font-bold text-[#7b8880]">诊断边界</p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-[#66736c]">
                    {result.limitations.map((item) => <li key={item}>· {item}</li>)}
                  </ul>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <h3 className="font-bold">标题建议</h3>
              <div className="mt-3 space-y-3">
                {(result.titleSuggestions ?? []).map((item) => (
                  <div key={item.title} className="rounded-xl bg-fog p-3">
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#5d6b64]">{item.rationale}</p>
                    <p className="mt-1 text-xs text-pine">预期：{item.expectedEffect}</p>
                  </div>
                ))}
                {(result.titleSuggestions?.length ?? 0) === 0 && (
                  <p className="text-sm text-[#7a8680]">暂无标题建议</p>
                )}
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <FileText size={17} className="text-pine" />
                  <h3 className="font-bold">文案与字幕</h3>
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-[#5d6b64]">
                  {result.copyAndSubtitleReview && (
                    <div className="rounded-xl bg-fog p-3 text-sm leading-6">
                      <p>
                        <span className="font-bold text-ink">文案合理性：</span>
                        {result.copyAndSubtitleReview.copyRationality}
                      </p>
                      <p className="mt-1">
                        <span className="font-bold text-ink">文案专业性：</span>
                        {result.copyAndSubtitleReview.copyProfessionalism}
                      </p>
                      <p className="mt-1">
                        <span className="font-bold text-ink">字幕合理性：</span>
                        {result.copyAndSubtitleReview.subtitleRationality}
                      </p>
                      <p className="mt-1">
                        <span className="font-bold text-ink">字幕专业性：</span>
                        {result.copyAndSubtitleReview.subtitleProfessionalism}
                      </p>
                      <p className="mt-2 text-pine">
                        修改要点：{result.copyAndSubtitleReview.revisionPoints.join("；")}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-[#7b8880]">原内容概述</p>
                    <p>{result.copySuggestions.originalSummary}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#7b8880]">完整脚本方向</p>
                    <p>{result.copySuggestions.revisedFullScript}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#7b8880]">字幕版</p>
                    <p>{result.copySuggestions.subtitleVersion}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <Volume2 size={17} className="text-pine" />
                  <h3 className="font-bold">声音与 BGM</h3>
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-[#5d6b64]">
                  <p><span className="font-bold text-ink">当前问题：</span>{result.audioSuggestions.currentIssues.join("；") || "未发现明确问题"}</p>
                  <p><span className="font-bold text-ink">开头动作：</span>{result.audioSuggestions.openingAudioAction}</p>
                  <p><span className="font-bold text-ink">音乐：</span>{result.audioSuggestions.musicMood} · {result.audioSuggestions.bpmRange ?? "按素材节奏确定"}</p>
                  <p><span className="font-bold text-ink">混音：</span>{result.audioSuggestions.voiceMusicBalance}</p>
                  <div>
                    <p className="text-xs font-bold text-[#7b8880]">转场建议</p>
                    <ul>{result.audioSuggestions.transitionSuggestions.map((item) => <li key={item}>· {item}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#7b8880]">避免事项</p>
                    <ul>{result.audioSuggestions.avoid.map((item) => <li key={item}>· {item}</li>)}</ul>
                  </div>
                </div>
              </Card>
            </div>

            <Link
              href={`/videos/${videoId}/report?returnTo=${encodeURIComponent(returnTo)}`}
              className="flex items-center justify-between rounded-2xl bg-ink px-6 py-5 text-white shadow-panel transition hover:bg-[#24332c]"
            >
              <span>
                <span className="block font-display text-xl font-semibold">
                  打开可编辑报告
                </span>
                <span className="mt-1 block text-xs text-white/65">
                  复制模块、保存修改并导出 Markdown
                </span>
              </span>
              <ArrowRight />
            </Link>
          </>
        )}
      </div>
    </div>
    </div>
  );
}
