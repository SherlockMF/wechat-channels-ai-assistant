"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  FileText,
  Gauge,
  PlayCircle,
  Scissors,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type {
  DiagnosisResult,
  DraftReview,
  DraftReviewChangelog,
  DraftReviewStatus,
} from "@video-diagnosis/shared-types";
import { DRAFT_REVIEW_MAX_VERSIONS } from "@video-diagnosis/shared-types";
import type { AccountBaseline } from "@/lib/metrics/account";
import { Badge, Button, Card, EmptyState, Progress } from "@/components/ui";
import { CoverFramePicker } from "@/features/covers/cover-frame-picker";
import { DraftCoverBriefPanel } from "@/features/draft-review/draft-cover-brief-panel";

const categoryLabel: Record<string, string> = {
  hook: "开头钩子",
  copy: "文案表达",
  visual: "视觉呈现",
  subtitle: "字幕信息",
  pacing: "内容节奏",
  audio: "声音设计",
  structure: "内容结构",
};

const analysisModeLabel: Record<string, string> = {
  draft_mock: "发布前审片（Provider 占位）",
  draft_provider: "发布前审片（LLM Provider）",
  draft_dashscope: "发布前审片（阿里云百炼）",
};

const stageLabel: Record<string, string> = {
  uploaded: "等待进入分析队列",
  extracting_evidence: "准备媒体证据",
  extracting_audio: "提取 16kHz 单声道音轨",
  transcribing: "识别口播",
  extracting_frames: "按时间码提取关键帧",
  recognizing_subtitles: "识别画面与字幕 OCR",
  analyzing: "生成证据化审片意见",
  completed: "分析完成",
  failed: "分析失败",
};

const severityLabel: Record<string, string> = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

const confidenceLabel: Record<string, string> = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
};

const performanceLabel: Record<string, string> = {
  low: "偏低",
  normal: "正常",
  high: "偏高",
};

const metricLabel: Record<string, string> = {
  completion_rate: "完播率",
  average_watch_seconds: "平均观看时长",
  like_rate: "点赞率",
  comment_rate: "评论率",
  share_rate: "分享率",
  follow_rate: "关注率",
};

const actionLabel: Record<string, string> = {
  delete: "删除",
  trim: "精剪",
  replace: "替换",
  move_forward: "前移",
  speed_up: "加速",
  add_subtitle: "补字幕",
  change_audio: "调整声音",
  reshoot: "补拍",
  keep: "保留",
};

const alignmentStatusLabel: Record<string, string> = {
  matched: "已对齐",
  partial: "部分对齐",
  missing: "疑似缺失",
  not_available: "证据不足",
};

const checklistStatusLabel: Record<string, string> = {
  ready: "可发布",
  fix: "先修改",
  verify: "待人工确认",
};

interface VersionSummary {
  id: string;
  versionNumber: number;
  status: DraftReviewStatus;
  createdAt: string;
  completedAt: string | null;
  originalFilename: string;
}

interface DraftPayload {
  draft: DraftReview;
  result: {
    result: DiagnosisResult;
    editedMarkdown: string | null;
    changelog: DraftReviewChangelog | null;
  } | null;
  versions: VersionSummary[];
  viewingVersionId: string | null;
  baseline: AccountBaseline;
  previewUrl: string;
  coverUrl: string | null;
  analysisMode: "draft_mock" | "draft_provider" | "draft_dashscope";
}

export function DraftReviewDetail({ draftReviewId }: { draftReviewId: string }) {
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pickingFrame, setPickingFrame] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadGoal, setUploadGoal] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [deletingVersionId, setDeletingVersionId] = useState("");
  const player = useRef<HTMLVideoElement>(null);

  async function load(nextVersionId?: string | null) {
    const query =
      nextVersionId != null && nextVersionId !== ""
        ? `?version=${encodeURIComponent(nextVersionId)}`
        : "";
    const response = await fetch(`/api/draft-reviews/${draftReviewId}${query}`);
    if (!response.ok) throw new Error(`审片读取失败（${response.status}）`);
    const body = (await response.json()) as DraftPayload;
    setPayload(body);
    setVersionId(body.viewingVersionId);
    setError("");
  }

  useEffect(() => {
    void load().catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : "审片读取失败"),
    );
  }, [draftReviewId]);

  useEffect(() => {
    if (!payload || !["uploaded", "processing"].includes(payload.draft.status)) return;
    const handle = window.setInterval(() => {
      void load(versionId).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(handle);
  }, [payload?.draft.status, draftReviewId, versionId]);

  function seek(second: number) {
    if (!player.current) return;
    player.current.currentTime = second;
    void player.current.play();
  }

  function openUpload() {
    if (!payload) return;
    setUploadTitle(payload.draft.title ?? "");
    setUploadGoal(payload.draft.goal ?? "");
    setUploadTags((payload.draft.tags ?? []).join("、"));
    setUploadFile(null);
    setUploadError("");
    setUploadStatus("");
    setUploading(true);
  }

  async function submitUpload() {
    if (!uploadFile) {
      setUploadError("请先选择视频文件");
      return;
    }
    setUploadBusy(true);
    setUploadError("");
    setUploadStatus("上传并分析中…");
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("title", uploadTitle);
      form.set("goal", uploadGoal);
      form.set("tags", uploadTags);
      const response = await fetch(`/api/draft-reviews/${draftReviewId}/versions`, {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "上传新版本失败");
      setUploading(false);
      await load(body.versionId ?? null);
    } catch (submitError) {
      setUploadError(
        submitError instanceof Error ? submitError.message : "上传新版本失败",
      );
    } finally {
      setUploadBusy(false);
      setUploadStatus("");
    }
  }

  async function deleteVersion(item: VersionSummary) {
    const count = payload?.versions?.length ?? 0;
    if (count <= 1) {
      setError("至少保留一个版本；删除整条审片请从列表操作");
      return;
    }
    if (!window.confirm(`删除 v${item.versionNumber}？诊断结果将一并移除。`)) {
      return;
    }
    setDeletingVersionId(item.id);
    try {
      const response = await fetch(
        `/api/draft-reviews/${draftReviewId}/versions/${item.id}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "删除版本失败");
      await load(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "删除版本失败",
      );
    } finally {
      setDeletingVersionId("");
    }
  }

  if (!payload) {
    return error ? (
      <Card className="p-6">
        <EmptyState title="审片读取失败" description={error} />
      </Card>
    ) : (
      <Card className="min-h-96 animate-pulse bg-white" />
    );
  }

  const diagnosis = payload.result?.result ?? null;
  const changelog = payload.result?.changelog ?? null;
  const versions = payload.versions ?? [];
  const currentNumber =
    versions.find((item) => item.id === payload.viewingVersionId)?.versionNumber ??
    versions[versions.length - 1]?.versionNumber ??
    1;
  const previousNumber = currentNumber > 1 ? currentNumber - 1 : null;
  const atVersionCap = versions.length >= DRAFT_REVIEW_MAX_VERSIONS;
  const analyzing = ["uploaded", "processing"].includes(payload.draft.status);

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-[#edc2bc] bg-[#fff3f1] px-4 py-3 text-sm text-[#9f4035]">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {versions.map((item) => {
            const active = item.id === payload.viewingVersionId;
            const latest =
              item.versionNumber ===
              Math.max(...versions.map((row) => row.versionNumber));
            const canDelete = versions.length > 1;
            return (
              <div
                key={item.id}
                className={`inline-flex items-center overflow-hidden rounded-lg text-sm font-bold ${
                  active
                    ? "bg-pine text-white"
                    : "bg-fog text-[#52615a]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void load(item.id)}
                  className={`px-3 py-1.5 transition ${
                    active ? "hover:bg-pine/90" : "hover:bg-[#e4ebe6]"
                  }`}
                >
                  v{item.versionNumber}
                  {latest ? " · 最新" : ""}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    title={`删除 v${item.versionNumber}`}
                    disabled={deletingVersionId === item.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteVersion(item);
                    }}
                    className={`border-l px-2 py-1.5 transition ${
                      active
                        ? "border-white/25 hover:bg-white/15"
                        : "border-line hover:bg-[#fdeceb] hover:text-coral"
                    }`}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <Button
          size="sm"
          disabled={analyzing || atVersionCap}
          onClick={openUpload}
        >
          <UploadCloud size={14} />
          上传新版本
        </Button>
      </div>
      {atVersionCap && (
        <p className="text-sm text-[#7a8680]">
          已达 {DRAFT_REVIEW_MAX_VERSIONS} 版上限。可删除旧版后再传。
        </p>
      )}

      {payload.draft.status === "failed" && (
        <Card className="border-coral/30 bg-[#fff4f2] p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 text-coral" size={18} />
            <div>
              <p className="font-bold text-coral">分析失败</p>
              <p className="mt-1 text-sm text-[#8a4f47]">
                {payload.draft.errorMessage ?? "未知错误"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {payload.result?.editedMarkdown && (
        <Card className="border-[#dfc89f] bg-[#fff9ef] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText size={18} className="mt-0.5 shrink-0 text-amber" />
              <div>
                <p className="font-bold">报告已人工修改</p>
                <p className="mt-1 text-sm text-[#75664f]">
                  下方为结构化诊断；对外分享请以可编辑报告为准。
                </p>
              </div>
            </div>
            <Link
              href={`/review/${draftReviewId}/report`}
              className="text-sm font-bold text-pine hover:underline"
            >
              查看人工版本
            </Link>
          </div>
        </Card>
      )}

      {pickingFrame && payload.previewUrl && (
        <CoverFramePicker
          videoUrl={payload.previewUrl}
          durationSeconds={payload.draft.durationSeconds}
          initialSecond={payload.draft.coverFrameSecond ?? 1}
          onCancel={() => setPickingFrame(false)}
          onConfirm={async (second, frame) => {
            const data = new FormData();
            data.append("second", String(second));
            data.append("frame", frame);
            const response = await fetch(
              `/api/draft-reviews/${draftReviewId}/cover-from-frame`,
              {
                method: "POST",
                body: data,
              },
            );
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "截帧失败");
            setPickingFrame(false);
            await load(versionId);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(560px,1.08fr)]">
        <Card className="overflow-hidden">
          <div className="aspect-video bg-[#101412]">
            {payload.previewUrl ? (
              <video
                key={payload.previewUrl}
                ref={player}
                src={payload.previewUrl}
                controls
                preload="metadata"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-white/60">
                视频不可用
              </div>
            )}
          </div>
          <div className="border-t border-line p-5">
            <p className="line-clamp-2 font-display text-xl font-semibold leading-7">
              {payload.draft.title || payload.draft.originalFilename}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {payload.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={payload.coverUrl}
                  alt="封面"
                  className="h-16 w-24 rounded-lg object-cover"
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Badge tone="info">
                  {analysisModeLabel[payload.analysisMode] ?? "发布前审片"}
                </Badge>
                <Badge tone="neutral">v{currentNumber}</Badge>
                {payload.draft.sourceScriptDraftId && (
                  <Link href={`/scripts/${payload.draft.sourceScriptDraftId}`}>
                    <Badge tone="info">已关联冻结脚本</Badge>
                  </Link>
                )}
                {payload.draft.goal && <Badge>{payload.draft.goal}</Badge>}
                {(payload.draft.tags ?? []).map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
                {payload.draft.durationSeconds && (
                  <Badge>{payload.draft.durationSeconds.toFixed(1)} 秒</Badge>
                )}
                {payload.draft.coverSource && (
                  <Badge tone="neutral">
                    {payload.draft.coverSource === "uploaded" ? "上传封面" : "截帧封面"}
                  </Badge>
                )}
              </div>
            </div>
            {payload.previewUrl && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => setPickingFrame(true)}
              >
                改选封面帧
              </Button>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <DraftCoverBriefPanel
                draftReviewId={draftReviewId}
                versionId={payload.viewingVersionId}
                compact
              />
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {changelog && previousNumber != null && (
            <Card className="border-pine/20 bg-[#f4faf6] p-6">
              <h2 className="font-display text-xl font-semibold">
                相对 v{previousNumber} 的改版对照
              </h2>
              <div className="mt-3 space-y-2 text-sm leading-6 text-[#3f4b45]">
                {changelog.improved.map((item) => (
                  <p key={`i-${item.category}-${item.summary}`}>✓ 已改善：{item.summary}</p>
                ))}
                {changelog.remaining.map((item) => (
                  <p key={`r-${item.category}-${item.summary}`}>! 仍存在：{item.summary}</p>
                ))}
                {changelog.newIssues.map((item) => (
                  <p key={`n-${item.category}-${item.summary}`}>+ 新问题：{item.summary}</p>
                ))}
                {changelog.improved.length +
                  changelog.remaining.length +
                  changelog.newIssues.length ===
                  0 && <p className="text-[#7a8680]">对照结果为空。</p>}
              </div>
            </Card>
          )}

          {diagnosis ? (
            <>
              <Card className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Gauge size={17} className="text-pine" />
                  <h2 className="font-display text-xl font-semibold">诊断摘要</h2>
                </div>
                <p className="text-sm leading-7 text-[#3f4b45]">
                  {diagnosis.executiveSummary}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="neutral">
                    表现判断：
                    {performanceLabel[diagnosis.dataAssessment.performanceLevel] ??
                      diagnosis.dataAssessment.performanceLevel}
                  </Badge>
                  <Badge tone="neutral">
                    样本置信度：
                    {confidenceLabel[diagnosis.dataAssessment.sampleConfidence] ??
                      diagnosis.dataAssessment.sampleConfidence}
                  </Badge>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-[#52615a]">
                  {diagnosis.dataAssessment.facts.map((fact) => (
                    <li key={fact}>• {fact}</li>
                  ))}
                </ul>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">逐时码证据与修改意见</h2>
                <p className="mt-2 text-xs leading-5 text-[#7a8680]">
                  每条意见都标注事实/推断、证据和置信度；点击秒点可直接回看。
                </p>
                <div className="mt-4 space-y-4">
                  {(diagnosis.detailedObservations ?? []).map((observation, index) => (
                    <div
                      key={`${observation.startSecond}-${observation.issue}-${index}`}
                      className="rounded-xl border border-line p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            tone={observation.priority === "high" ? "warning" : "neutral"}
                          >
                            {severityLabel[observation.priority] ?? observation.priority}
                          </Badge>
                          <Badge tone="neutral">
                            {observation.nature === "fact" ? "事实观察" : "证据推断"}
                          </Badge>
                          <Badge tone="neutral">
                            {confidenceLabel[observation.confidence] ?? observation.confidence}
                          </Badge>
                        </div>
                        <button
                          type="button"
                          onClick={() => seek(observation.startSecond)}
                          className="text-xs font-bold text-pine hover:underline"
                        >
                          {observation.startSecond.toFixed(1)}s –{" "}
                          {observation.endSecond.toFixed(1)}s
                        </button>
                      </div>
                      <p className="mt-3 text-sm font-bold text-ink">{observation.issue}</p>
                      <div className="mt-2 rounded-lg bg-fog p-3 text-xs leading-5 text-[#52615a]">
                        {observation.evidence.map((item) => (
                          <p key={item}>• {item}</p>
                        ))}
                      </div>
                      <p className="mt-3 text-sm font-semibold text-pine">
                        怎么改：{observation.recommendation}
                      </p>
                      <p className="mt-2 rounded-lg bg-[#f4faf6] px-3 py-2 text-sm text-[#3f4b45]">
                        替换示例：{observation.replacementExample}
                      </p>
                      <p className="mt-2 text-xs text-[#7a8680]">
                        预期影响：
                        {metricLabel[observation.expectedMetric] ?? observation.expectedMetric}
                      </p>
                    </div>
                  ))}
                  {(diagnosis.detailedObservations?.length ?? 0) === 0 && (
                    <p className="text-sm text-[#7a8680]">
                      当前结果未包含逐时码证据，可重新分析以生成增强版意见。
                    </p>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">脚本与成片对齐</h2>
                {diagnosis.scriptAlignment ? (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["开头承诺", diagnosis.scriptAlignment.openingPromise],
                          ["核心信息", diagnosis.scriptAlignment.coreMessage],
                          ["证据素材", diagnosis.scriptAlignment.proofAssets],
                          ["结尾行动号召", diagnosis.scriptAlignment.cta],
                        ] as const
                      ).map(([label, item]) => (
                        <div key={label} className="rounded-xl border border-line p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold">{label}</p>
                            <Badge tone={item.status === "missing" ? "warning" : "neutral"}>
                              {alignmentStatusLabel[item.status] ?? item.status}
                            </Badge>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-[#52615a]">
                            <span className="font-bold text-ink">脚本预期：</span>
                            {item.expected}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[#52615a]">
                            <span className="font-bold text-ink">成片观察：</span>
                            {item.observed}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-pine">
                            {item.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                    {(diagnosis.scriptAlignment.omissions.length > 0 ||
                      diagnosis.scriptAlignment.deviations.length > 0) && (
                      <div className="mt-4 rounded-xl bg-fog p-4 text-sm leading-6 text-[#52615a]">
                        {diagnosis.scriptAlignment.omissions.map((item) => (
                          <p key={`omission-${item}`}>• 遗漏：{item}</p>
                        ))}
                        {diagnosis.scriptAlignment.deviations.map((item) => (
                          <p key={`deviation-${item}`}>• 偏离：{item}</p>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-[#7a8680]">当前结果未包含脚本对齐。</p>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">发布前检查单</h2>
                <div className="mt-4 space-y-3">
                  {(diagnosis.publishChecklist ?? []).map((item) => (
                    <div
                      key={item.item}
                      className="flex flex-col gap-2 rounded-xl border border-line p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold">{item.item}</p>
                        <p className="mt-1 text-xs leading-5 text-[#66736c]">{item.reason}</p>
                      </div>
                      <Badge tone={item.status === "fix" ? "warning" : "neutral"}>
                        {checklistStatusLabel[item.status] ?? item.status}
                      </Badge>
                    </div>
                  ))}
                  {(diagnosis.publishChecklist?.length ?? 0) === 0 && (
                    <p className="text-sm text-[#7a8680]">当前结果未包含发布检查单。</p>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <PlayCircle size={17} className="text-pine" />
                  <h2 className="font-display text-xl font-semibold">主要问题</h2>
                </div>
                <div className="space-y-4">
                  {diagnosis.primaryProblems.map((problem) => (
                    <div
                      key={`${problem.category}-${problem.startSecond}`}
                      className="rounded-xl bg-fog p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">
                            {categoryLabel[problem.category] ?? problem.category}
                          </p>
                          <Badge tone={problem.severity === "high" ? "warning" : "neutral"}>
                            {severityLabel[problem.severity] ?? problem.severity}
                          </Badge>
                          <Badge tone="neutral">
                            {confidenceLabel[problem.confidence] ?? problem.confidence}
                          </Badge>
                        </div>
                        <button
                          type="button"
                          onClick={() => seek(problem.startSecond)}
                          className="text-xs font-bold text-pine hover:underline"
                        >
                          {problem.startSecond.toFixed(1)}s – {problem.endSecond.toFixed(1)}s
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-[#52615a]">{problem.inference}</p>
                      {problem.contentEvidence.length > 0 && (
                        <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs leading-5 text-[#52615a]">
                          <p className="font-bold text-ink">内容证据</p>
                          {problem.contentEvidence.map((item) => (
                            <p key={item}>• {item}</p>
                          ))}
                        </div>
                      )}
                      {problem.dataEvidence.length > 0 && (
                        <div className="mt-2 text-xs leading-5 text-[#66736c]">
                          <span className="font-bold">数据依据：</span>
                          {problem.dataEvidence.join("；")}
                        </div>
                      )}
                      <p className="mt-2 text-sm font-semibold text-pine">
                        建议：{problem.recommendation}
                      </p>
                      <p className="mt-1 text-xs text-[#7a8680]">
                        预期影响：{metricLabel[problem.expectedMetric] ?? problem.expectedMetric}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Scissors size={17} className="text-pine" />
                  <h2 className="font-display text-xl font-semibold">剪辑动作</h2>
                </div>
                <div className="space-y-3">
                  {diagnosis.editingPlan.map((item) => (
                    <div
                      key={`${item.startSecond}-${item.action}`}
                      className="rounded-xl border border-line p-4"
                    >
                      <p className="text-sm font-bold">
                        {item.startSecond.toFixed(1)}s – {item.endSecond.toFixed(1)}s ·{" "}
                        {actionLabel[item.action] ?? item.action}
                        {item.requiresReshoot ? " · 需补拍" : ""}
                      </p>
                      <p className="mt-1 text-xs text-[#7a8680]">
                        原内容：{item.originalContent}
                        {item.sourceAsset
                          ? `；取材 ${item.sourceAsset.sourceStartSecond.toFixed(1)}–${item.sourceAsset.sourceEndSecond.toFixed(1)}s`
                          : ""}
                      </p>
                      <p className="mt-1 text-sm text-[#52615a]">{item.problem}</p>
                      <p className="mt-2 text-sm text-pine">{item.replacementContent}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">新版开头分镜</h2>
                <div className="mt-4 space-y-3">
                  {diagnosis.revisedOpening.map((item) => (
                    <div
                      key={`${item.startSecond}-${item.endSecond}-${item.subtitle}`}
                      className="rounded-xl border border-line p-4"
                    >
                      <button
                        type="button"
                        onClick={() => seek(item.startSecond)}
                        className="text-xs font-bold text-pine hover:underline"
                      >
                        {item.startSecond.toFixed(1)}s – {item.endSecond.toFixed(1)}s
                      </button>
                      <div className="mt-3 grid gap-2 text-sm leading-6 text-[#52615a] sm:grid-cols-2">
                        <p><span className="font-bold text-ink">画面：</span>{item.visual}</p>
                        <p><span className="font-bold text-ink">口播：</span>{item.voiceover}</p>
                        <p><span className="font-bold text-ink">字幕：</span>{item.subtitle}</p>
                        <p><span className="font-bold text-ink">声音：</span>{item.audio}</p>
                        <p><span className="font-bold text-ink">节奏：</span>{item.editingRhythm}</p>
                        <p><span className="font-bold text-ink">素材：</span>{item.requiresReshoot ? "需补拍" : "可用现有素材"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">钩子备选</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {diagnosis.hookAlternatives.map((item) => (
                    <div key={`${item.type}-${item.voiceover}`} className="rounded-xl bg-fog p-4">
                      <Badge tone="neutral">
                        {item.type === "result"
                          ? "结果型"
                          : item.type === "pain_point"
                            ? "痛点型"
                            : "悬念型"}
                      </Badge>
                      <p className="mt-3 text-sm font-bold text-ink">{item.voiceover}</p>
                      <p className="mt-2 text-xs text-[#52615a]">字幕：{item.subtitle}</p>
                      <p className="mt-1 text-xs text-[#52615a]">画面：{item.visual}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">文案与字幕专业性</h2>
                {diagnosis.copyAndSubtitleReview ? (
                  <div className="mt-3 space-y-2 text-sm leading-6 text-[#3f4b45]">
                    <p>
                      <span className="font-bold">文案合理性：</span>
                      {diagnosis.copyAndSubtitleReview.copyRationality}
                    </p>
                    <p>
                      <span className="font-bold">文案专业性：</span>
                      {diagnosis.copyAndSubtitleReview.copyProfessionalism}
                    </p>
                    <p>
                      <span className="font-bold">字幕合理性：</span>
                      {diagnosis.copyAndSubtitleReview.subtitleRationality}
                    </p>
                    <p>
                      <span className="font-bold">字幕专业性：</span>
                      {diagnosis.copyAndSubtitleReview.subtitleProfessionalism}
                    </p>
                    <p>
                      <span className="font-bold">问题：</span>
                      {diagnosis.copyAndSubtitleReview.issues.join("；")}
                    </p>
                    <p className="font-semibold text-pine">
                      修改要点：
                      {diagnosis.copyAndSubtitleReview.revisionPoints.join("；")}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#7a8680]">
                    本次结果未包含文案/字幕专项评估。
                  </p>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">标题建议</h2>
                {(payload.draft.tags?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-[#7a8680]">
                    基于标签：{(payload.draft.tags ?? []).join("、")}
                  </p>
                )}
                <div className="mt-3 space-y-3">
                  {(diagnosis.titleSuggestions ?? []).map((item) => (
                    <div key={item.title} className="rounded-xl border border-line p-4">
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                      <p className="mt-1 text-sm text-[#52615a]">{item.rationale}</p>
                      <p className="mt-1 text-sm text-pine">预期：{item.expectedEffect}</p>
                      {(item.basedOnSimilarTitles?.length ?? 0) > 0 && (
                        <p className="mt-2 text-xs text-[#7a8680]">
                          参考：{item.basedOnSimilarTitles.join("；")}
                        </p>
                      )}
                    </div>
                  ))}
                  {(diagnosis.titleSuggestions?.length ?? 0) === 0 && (
                    <p className="text-sm text-[#7a8680]">
                      暂无标题建议，可补充标签后重新分析。
                    </p>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">文案与行动号召</h2>
                <p className="mt-3 text-xs leading-5 text-[#7a8680]">
                  原内容摘要：{diagnosis.copySuggestions.originalSummary}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#3f4b45]">
                  {diagnosis.copySuggestions.revisedFullScript}
                </p>
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-fog p-4 text-sm leading-6 text-[#3f4b45]">
                  <span className="font-bold">字幕版：</span>
                  {diagnosis.copySuggestions.subtitleVersion}
                </p>
                <p className="mt-4 text-sm font-semibold text-pine">
                  行动号召：{diagnosis.copySuggestions.cta}
                </p>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-xl font-semibold">声音建议</h2>
                <div className="mt-3 space-y-2 text-sm leading-6 text-[#3f4b45]">
                  <p><span className="font-bold">当前问题：</span>{diagnosis.audioSuggestions.currentIssues.join("；") || "无"}</p>
                  <p><span className="font-bold">音乐情绪：</span>{diagnosis.audioSuggestions.musicMood}</p>
                  {diagnosis.audioSuggestions.bpmRange && (
                    <p><span className="font-bold">BPM：</span>{diagnosis.audioSuggestions.bpmRange}</p>
                  )}
                  <p><span className="font-bold">开头：</span>{diagnosis.audioSuggestions.openingAudioAction}</p>
                  <p><span className="font-bold">人声 / 音乐：</span>{diagnosis.audioSuggestions.voiceMusicBalance}</p>
                  <p><span className="font-bold">转场：</span>{diagnosis.audioSuggestions.transitionSuggestions.join("；") || "无"}</p>
                  <p><span className="font-bold">避免：</span>{diagnosis.audioSuggestions.avoid.join("；") || "无"}</p>
                </div>
              </Card>

              <Card className="border-[#ead8b7] bg-[#fffaf1] p-6">
                <h2 className="font-display text-xl font-semibold">证据边界与人工复核</h2>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[#685f50]">
                  {diagnosis.limitations.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </Card>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/review/${draftReviewId}/report`}
                  className="rounded-lg bg-pine px-4 py-2 text-sm font-bold text-white"
                >
                  编辑 / 导出报告
                </Link>
              </div>
            </>
          ) : analyzing ? (
            <Card className="p-6">
              <EmptyState
                title="正在分析"
                description={`当前步骤：${stageLabel[payload.draft.currentStep] ?? payload.draft.currentStep}`}
              />
              <div className="mt-4">
                <Progress value={payload.draft.progress} />
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <EmptyState title="暂无诊断结果" description="请重新上传或检查分析日志。" />
            </Card>
          )}
        </div>
      </div>

      {uploading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6">
            <h2 className="font-display text-xl font-semibold">上传新版本</h2>
            <p className="text-sm text-[#66736c]">
              标题 / 标签 / 目标默认沿用，可按需修改。提交后将完整重出诊断并生成改版对照。
            </p>
            <label className="block text-sm font-bold text-[#52615a]">
              视频文件
              <input
                type="file"
                accept="video/*"
                className="mt-2 block w-full text-sm font-normal"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-sm font-bold text-[#52615a]">
              标题
              <input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold text-[#52615a]">
              发布目标
              <textarea
                value={uploadGoal}
                onChange={(event) => setUploadGoal(event.target.value)}
                rows={2}
                className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold text-[#52615a]">
              视频标签
              <input
                value={uploadTags}
                onChange={(event) => setUploadTags(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm font-normal"
              />
            </label>
            {uploadStatus && <p className="text-sm text-pine">{uploadStatus}</p>}
            {uploadError && (
              <p className="rounded-xl border border-[#edc2bc] bg-[#fff3f1] px-4 py-3 text-sm text-[#9f4035]">
                {uploadError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={uploadBusy}
                onClick={() => setUploading(false)}
              >
                取消
              </Button>
              <Button disabled={uploadBusy} onClick={() => void submitUpload()}>
                {uploadBusy ? "处理中…" : "上传并分析"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
