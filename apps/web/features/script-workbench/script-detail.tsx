"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Download, FileDown, RefreshCw } from "lucide-react";
import type {
  ScriptDraft,
  ScriptDraftOutput,
  ViralResearchItem,
} from "@video-diagnosis/shared-types";
import { Badge, Button, Card } from "@/components/ui";
import {
  formatLabel,
  topicLabel,
} from "@/lib/script-workbench/catalog";
import { resolveDraftListTitle } from "@/lib/script-workbench/display";
import { exportMarkdownAsPdf } from "@/lib/reports/export-pdf";
import { shouldShowViralPlan } from "@/lib/script-workbench/viral-plan";
import { ScriptResearchPanel } from "@/features/script-workbench/script-research-panel";

const researchStatusLabel = {
  verified: "已完成可追溯检索",
  unverified: "热点未验证",
  skipped: "已跳过研究",
} as const;

const hookMechanismLabel: Record<string, string> = {
  result: "结果前置",
  loss_aversion: "损失规避",
  contrarian: "反常识",
  checklist: "清单",
  real_case: "真实案例",
  new_technology: "新技术",
  custom: "自定义",
};

const rewriteModeLabel = {
  preserve: "保留原稿",
  polish: "适度润色",
  deep: "深度改写",
} as const;

export function ScriptDetail({ scriptId }: { scriptId: string }) {
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [parentDraft, setParentDraft] = useState<ScriptDraft | null>(null);
  const [versionView, setVersionView] = useState<"optimized" | "original">(
    "optimized",
  );
  const [plainText, setPlainText] = useState("");
  const [researchSources, setResearchSources] = useState<ViralResearchItem[]>([]);
  const [researchPanelOpen, setResearchPanelOpen] = useState(false);
  const [researchPanelMounted, setResearchPanelMounted] = useState(false);
  const [researchPanelExpanded, setResearchPanelExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/scripts/${scriptId}`);
    if (!response.ok) throw new Error("读取失败");
    const body = await response.json();
    setDraft(body.draft);
    setPlainText(
      body.draft.editedPlainText ?? body.draft.output?.plainText ?? "",
    );
  }

  useEffect(() => {
    void load()
      .then(() => setError(""))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "读取失败"),
      )
      .finally(() => setLoading(false));
  }, [scriptId]);

  useEffect(() => {
    const parentId = draft?.parentScriptDraftId;
    if (!parentId) {
      setParentDraft(null);
      setVersionView("optimized");
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/scripts/${encodeURIComponent(parentId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        if (!body?.draft) return;
        setParentDraft(body.draft as ScriptDraft);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [draft?.parentScriptDraftId]);

  useEffect(() => {
    const snapshotId = draft?.input.researchSnapshotId;
    if (!snapshotId) {
      setResearchSources([]);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/viral-research/${encodeURIComponent(snapshotId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        if (!body) return;
        const items = body.snapshot?.items ?? body.items ?? [];
        if (Array.isArray(items)) setResearchSources(items as ViralResearchItem[]);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [draft?.input.researchSnapshotId]);

  async function save(): Promise<boolean> {
    if (!draft) return false;
    if (!draft.output) {
      setError("当前稿件无结构化输出，无法保存全文");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/scripts/${scriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedPlainText:
            plainText === draft.output.plainText ? null : plainText,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      setDraft(body.draft);
      setPlainText(
        body.draft.editedPlainText ?? body.draft.output?.plainText ?? "",
      );
      setMessage("已保存");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function researchAndOptimize() {
    if (textDiverged && !(await save())) return;
    setResearchPanelMounted(true);
    setResearchPanelOpen(true);
    setResearchPanelExpanded(true);
  }

  async function regenerate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/scripts/${scriptId}/regenerate`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "再生成失败");
      window.location.href = `/scripts/${body.draft.id}`;
    } catch (regenError) {
      setError(
        regenError instanceof Error ? regenError.message : "再生成失败",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(displayPlainText);
      setMessage("已复制全文");
    } catch {
      setError("复制失败，请手动选择全文复制");
    }
  }

  function exportFileBaseName(): string {
    const title = resolveDraftListTitle(draft!).replace(/[\\/:*?"<>|]/gu, "_").trim();
    const safeTitle = title.slice(0, 40) || scriptId;
    return `脚本-${safeTitle}`;
  }

  function exportMarkdown() {
    const content = displayPlainText.trim();
    if (!content) {
      setError("暂无正文可导出");
      return;
    }
    try {
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${exportFileBaseName()}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Markdown 已导出");
      setError("");
    } catch {
      setError("Markdown 导出失败");
    }
  }

  function exportPdf() {
    const content = displayPlainText.trim();
    if (!content) {
      setError("暂无正文可导出");
      return;
    }
    try {
      exportMarkdownAsPdf(content, exportFileBaseName());
      setMessage("已打开 PDF 打印预览，请选择「另存为 PDF」");
      setError("");
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "PDF 导出失败");
    }
  }

  if (loading) {
    return <Card className="p-6 text-sm text-[#66736c]">加载中…</Card>;
  }
  if (!draft) {
    return (
      <Card className="space-y-3 p-6">
        <p className="text-sm text-coral">{error || "脚本不存在"}</p>
        <Link href="/scripts">
          <Button variant="secondary">返回列表</Button>
        </Link>
      </Card>
    );
  }

  const output = draft.output;
  const showingOriginal =
    versionView === "original" && parentDraft?.output != null;
  const displayOutput: ScriptDraftOutput | null | undefined = showingOriginal
    ? parentDraft?.output
    : output;
  const displayPlainText = showingOriginal
    ? parentDraft?.editedPlainText ??
      parentDraft?.output?.plainText ??
      ""
    : plainText;
  const canCompareVersions = Boolean(parentDraft?.output);
  const reviewInput = showingOriginal ? parentDraft?.input : draft.input;
  const hasOriginalScript = Boolean(reviewInput?.existingScript?.trim());
  const showViralPlan = shouldShowViralPlan(displayOutput?.viralPlan);
  const textDiverged =
    !showingOriginal &&
    output != null &&
    plainText.trim() !== output.plainText.trim();
  const providerLabel =
    draft.provider === "mock-degraded"
      ? "mock（已降级）"
      : draft.provider;

  return (
    <div
      className={`space-y-4 transition-[margin] ${
        researchPanelOpen && researchPanelExpanded ? "lg:mr-[28rem]" : ""
      }`}
    >
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{formatLabel(draft.format, draft.formatOther)}</Badge>
          <Badge>{topicLabel(draft.topic, draft.topicOther)}</Badge>
          <Badge tone="neutral">
            {rewriteModeLabel[draft.input.rewriteMode ?? "polish"]}
          </Badge>
          {showViralPlan && output?.viralPlan ? (
            <Badge
              tone={
                output.viralPlan.researchStatus === "verified"
                  ? "success"
                  : output.viralPlan.researchStatus === "unverified"
                    ? "warning"
                    : "neutral"
              }
            >
              {researchStatusLabel[output.viralPlan.researchStatus]}
            </Badge>
          ) : null}
          {draft.promptVersion ? (
            <Badge tone="neutral">{draft.promptVersion}</Badge>
          ) : null}
          {providerLabel ? (
            <Badge
              tone={draft.provider === "mock-degraded" ? "warning" : "neutral"}
            >
              {providerLabel}
            </Badge>
          ) : null}
        </div>
        <h2 className="font-display text-2xl font-semibold">
          {resolveDraftListTitle(draft)}
        </h2>
        <p className="text-sm text-[#66736c]">{draft.ideaSummary}</p>
        {draft.parentScriptDraftId ? (
          <p className="text-xs text-[#7a8680]">
            由
            <Link
              href={`/scripts/${encodeURIComponent(draft.parentScriptDraftId)}`}
              className="mx-1 font-semibold text-pine hover:underline"
            >
              此稿
            </Link>
            再生成，可回看生成链路。
          </p>
        ) : null}
        {draft.provider === "mock-degraded" ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            模型生成失败，已降级为本地模板稿，请人工核对后再用。
          </p>
        ) : null}
        {textDiverged ? (
          <p className="rounded-lg border border-line bg-[#f4f7f5] px-3 py-2 text-sm text-[#52615a]">
            全文已手工修改，上方结构化区块可能不同步；复制/导出以全文为准。
          </p>
        ) : null}
        {canCompareVersions ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#7a8680]">版本对比</span>
            <Button
              size="sm"
              variant={versionView === "optimized" ? "primary" : "secondary"}
              onClick={() => setVersionView("optimized")}
            >
              优化后
            </Button>
            <Button
              size="sm"
              variant={versionView === "original" ? "primary" : "secondary"}
              onClick={() => setVersionView("original")}
            >
              优化前
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copyAll()} disabled={showingOriginal}>
            <Copy size={14} />
            复制全文
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!displayPlainText.trim()}
            onClick={exportMarkdown}
          >
            <Download size={14} />
            导出 Markdown
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!displayPlainText.trim()}
            onClick={exportPdf}
          >
            <FileDown size={14} />
            导出 PDF
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || showingOriginal}
            onClick={() => void save()}
          >
            保存修改
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void regenerate()}
          >
            <RefreshCw size={14} />
            再生成（新记录）
          </Button>
          <Button
            size="sm"
            variant={researchPanelOpen ? "primary" : "secondary"}
            disabled={busy || showingOriginal}
            onClick={() => void researchAndOptimize()}
          >
            研究爆款并优化
          </Button>
          <Link href={`/review/new?scriptId=${encodeURIComponent(scriptId)}`}>
            <Button size="sm" variant="secondary">
              去审片
            </Button>
          </Link>
          <Link href="/scripts">
            <Button size="sm" variant="ghost">
              返回列表
            </Button>
          </Link>
        </div>
        {message ? <p className="text-xs text-pine">{message}</p> : null}
        {error ? <p className="text-xs text-coral">{error}</p> : null}
      </Card>

      {displayOutput?.pipeline === "koubo" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">标题备选</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {displayOutput.titles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
            <h3 className="font-semibold">标签</h3>
            <p className="text-sm">{displayOutput.tags.map((tag) => `#${tag}`).join(" ")}</p>
            <h3 className="font-semibold">口播稿</h3>
            <p className="whitespace-pre-wrap text-sm leading-7">{displayOutput.script}</p>
          </Card>
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">穿插素材</h3>
            <ul className="space-y-2 text-sm">
              {displayOutput.brollCues.map((cue) => (
                <li key={`${cue.section}-${cue.cue}`}>
                  <span className="font-semibold">{cue.section}：</span>
                  {cue.cue}
                </li>
              ))}
            </ul>
            <h3 className="font-semibold">字幕要点</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {displayOutput.subtitleBeats.map((beat) => (
                <li key={beat}>{beat}</li>
              ))}
            </ul>
            <h3 className="font-semibold">备选开头</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {displayOutput.altHooks.map((hook) => (
                <li key={hook}>{hook}</li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {displayOutput?.pipeline === "follow" ? (
        <Card className="space-y-3 p-5">
          {displayOutput.positioning ? (
            <>
              <h3 className="font-semibold">本片定位</h3>
              <p className="text-sm">{displayOutput.positioning}</p>
            </>
          ) : null}
          <h3 className="font-semibold">拍摄/剪辑顺序</h3>
          <ol className="space-y-3 text-sm">
            {displayOutput.timeline.map((step) => (
              <li key={step.order} className="rounded-xl border border-line p-3">
                <p className="font-semibold">
                  {step.order}. 拍：{step.shoot}
                </p>
                {step.say ? <p className="text-[#52615a]">说：{step.say}</p> : null}
                {step.subtitle ? (
                  <p className="text-[#88948d]">字幕：{step.subtitle}</p>
                ) : null}
              </li>
            ))}
          </ol>
          {displayOutput.gapsOrWarnings.length ? (
            <>
              <h3 className="font-semibold">补拍/注意</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {displayOutput.gapsOrWarnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {showViralPlan && displayOutput?.viralPlan ? (
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">参考依据与爆款拆解</h3>
              <p className="mt-1 text-sm text-[#66736c]">
                {displayOutput.viralPlan.topicAngle}
              </p>
            </div>
            <Badge
              tone={
                displayOutput.viralPlan.researchStatus === "verified"
                  ? "success"
                  : displayOutput.viralPlan.researchStatus === "unverified"
                    ? "warning"
                    : "neutral"
              }
            >
              {researchStatusLabel[displayOutput.viralPlan.researchStatus]}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-semibold text-[#7a8680]">为什么现在做</p>
              <p className="mt-2 text-sm leading-6">{displayOutput.viralPlan.whyNow}</p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-semibold text-[#7a8680]">目标人群</p>
              <p className="mt-2 text-sm leading-6">
                {displayOutput.viralPlan.targetAudience}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#52615a]">三种开头机制</h4>
            <div className="mt-2 grid gap-3 lg:grid-cols-3">
              {displayOutput.viralPlan.hookMechanisms.map((item, index) => (
                <div
                  key={`${item.mechanism}-${index}`}
                  className="rounded-xl border border-line bg-fog p-4"
                >
                  <Badge tone="info">
                    {hookMechanismLabel[item.mechanism] ?? item.mechanism}
                  </Badge>
                  <p className="mt-3 text-sm font-semibold leading-6">{item.hook}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#edf5f0] p-4">
            <p className="text-xs font-semibold text-[#52615a]">封面文案</p>
            <p className="mt-2 font-display text-xl font-semibold text-ink">
              {displayOutput.viralPlan.coverCopy}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#52615a]">逐段证据</h4>
            <div className="mt-2 space-y-2">
              {displayOutput.viralPlan.evidenceBeats.map((beat, index) => (
                <div
                  key={`${beat.section}-${index}`}
                  className="space-y-3 rounded-xl border border-line p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-bold">{beat.section}</p>
                    <p className="text-sm text-[#52615a]">主张：{beat.claim}</p>
                  </div>
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <p><span className="font-semibold">口播：</span>{beat.voiceover || "未提供"}</p>
                    <p><span className="font-semibold">画面：</span>{beat.visual || "未提供"}</p>
                    <p><span className="font-semibold">字幕：</span>{beat.subtitle || "未提供"}</p>
                    <p><span className="font-semibold">声音：</span>{beat.audio || "未提供"}</p>
                  </div>
                  <p className="rounded-lg bg-[#edf5f0] px-3 py-2 text-sm font-semibold text-pine">
                    证明素材：{beat.evidenceNeeded}
                  </p>
                </div>
              ))}
              {!displayOutput.viralPlan.evidenceBeats.length ? (
                <p className="text-sm text-[#7a8680]">本稿未生成逐段证据要求。</p>
              ) : null}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#52615a]">发布验证指标</h4>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {displayOutput.viralPlan.publishingMetrics.map((item, index) => (
                <div
                  key={`${item.metric}-${index}`}
                  className="rounded-xl border border-line p-4"
                >
                  <p className="text-sm font-bold">{item.metric}</p>
                  <p className="mt-1 text-sm text-[#52615a]">{item.hypothesis}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[#52615a]">来源追踪</h4>
            <div className="flex flex-wrap gap-2">
              {displayOutput.viralPlan.sourceIds.map((sourceId) => (
                (() => {
                  const source = researchSources.find((item) => item.id === sourceId);
                  const href =
                    source?.url ||
                    (draft.input.researchSnapshotId
                      ? `/api/viral-research/${encodeURIComponent(draft.input.researchSnapshotId)}`
                      : "");
                  return href ? (
                    <a
                      key={sourceId}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-fog px-3 py-1 text-xs font-semibold text-pine hover:underline"
                    >
                      {source?.title || sourceId}
                    </a>
                  ) : (
                    <Badge key={sourceId} tone="neutral">
                      {sourceId}
                    </Badge>
                  );
                })()
              ))}
              {draft.referenceVideoIds.map((sourceId) => (
                <Badge key={`account-${sourceId}`} tone="neutral">
                  账号历史 · {sourceId}
                </Badge>
              ))}
              {!displayOutput.viralPlan.sourceIds.length && !draft.referenceVideoIds.length ? (
                <span className="text-sm text-[#7a8680]">未使用具体参考条目</span>
              ) : null}
            </div>
          </div>

          {displayOutput.viralPlan.limitations.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h4 className="text-sm font-semibold text-amber-900">研究与结论边界</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {displayOutput.viralPlan.limitations.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {displayOutput?.scriptReview ? (
        <Card className="space-y-5 p-5">
          <div>
            <h3 className="font-semibold">逐句质检</h3>
            <p className="mt-1 text-sm leading-6 text-[#52615a]">
              {displayOutput.scriptReview.summary}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {(
              [
                ["标题 → 开头", displayOutput.scriptReview.consistency.titleToOpening],
                ["开头 → 正文", displayOutput.scriptReview.consistency.openingToBody],
                ["正文 → 行动号召", displayOutput.scriptReview.consistency.bodyToCta],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line p-4">
                <p className="text-xs font-semibold text-[#7a8680]">{label}</p>
                <p className="mt-2 text-sm leading-6">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {displayOutput.scriptReview.lineIssues.map((issue, index) => (
              <div
                key={`${issue.original}-${index}`}
                className="rounded-xl border border-line p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      issue.priority === "high"
                        ? "warning"
                        : issue.priority === "medium"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {issue.priority === "high"
                      ? "优先改"
                      : issue.priority === "medium"
                        ? "建议改"
                        : "可优化"}
                  </Badge>
                  <p className="text-sm font-semibold">
                    {hasOriginalScript ? "原句" : "当前句"}：{issue.original}
                  </p>
                </div>
                <p className="mt-2 text-sm text-[#52615a]">问题：{issue.problem}</p>
                <p className="mt-2 text-sm font-semibold text-pine">
                  建议：{issue.replacement}
                </p>
                <p className="mt-1 text-xs text-[#7a8680]">理由：{issue.reason}</p>
              </div>
            ))}
            {!displayOutput.scriptReview.lineIssues.length ? (
              <p className="text-sm text-[#7a8680]">未发现需要逐句修改的问题。</p>
            ) : null}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#52615a]">待核验主张</h4>
            <div className="mt-2 space-y-2">
              {displayOutput.scriptReview.claimsToVerify.map((item, index) => (
                <div
                  key={`${item.claim}-${index}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm font-bold text-amber-950">{item.claim}</p>
                  <p className="mt-1 text-sm text-amber-900">风险：{item.risk}</p>
                  <p className="mt-2 text-sm font-semibold text-pine">
                    安全表述：{item.safeWording}
                  </p>
                </div>
              ))}
              {!displayOutput.scriptReview.claimsToVerify.length ? (
                <p className="text-sm text-[#7a8680]">没有额外待核验主张。</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl bg-fog p-4">
            <h4 className="text-sm font-semibold text-[#52615a]">原创性检查</h4>
            <p className="mt-2 text-sm leading-6">{displayOutput.scriptReview.originality}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#52615a]">A/B 验证方案</h4>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {displayOutput.scriptReview.abTests.map((test, index) => (
                <div
                  key={`${test.variable}-${index}`}
                  className="rounded-xl border border-line p-4 text-sm"
                >
                  <p className="font-bold">{test.variable}</p>
                  <p className="mt-2 text-[#52615a]">A：{test.variantA}</p>
                  <p className="mt-1 text-[#52615a]">B：{test.variantB}</p>
                  <p className="mt-2 font-semibold text-pine">观察：{test.metric}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {displayOutput?.productionGuide ? (
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">拍摄与剪辑指导</h3>
            <Badge
              tone={
                displayOutput.productionGuide.shootStatus === "shot"
                  ? "info"
                  : "neutral"
              }
            >
              {displayOutput.productionGuide.shootStatus === "shot"
                ? "已拍摄"
                : "未拍摄"}
            </Badge>
          </div>

          {displayOutput.productionGuide.shootStatus === "shot" &&
          displayOutput.productionGuide.materials.length ? (
            <>
              <h4 className="text-sm font-semibold text-[#52615a]">素材描述</h4>
              <ul className="space-y-2 text-sm">
                {displayOutput.productionGuide.materials.map((item, index) => (
                  <li
                    key={`material-${index}`}
                    className="rounded-xl border border-line p-3"
                  >
                    <p className="font-semibold">{item.section}</p>
                    <p className="text-[#52615a]">{item.description}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {displayOutput.productionGuide.shootStatus === "unshot" &&
          displayOutput.productionGuide.storyboard.length ? (
            <>
              <h4 className="text-sm font-semibold text-[#52615a]">拍摄分镜</h4>
              <ol className="space-y-3 text-sm">
                {displayOutput.productionGuide.storyboard.map((shot, index) => (
                  <li
                    key={`shot-${index}`}
                    className="rounded-xl border border-line p-3"
                  >
                    <p className="font-semibold">
                      {shot.order}. {shot.shot}
                    </p>
                    <p className="text-[#52615a]">
                      运镜/景别：{shot.camera}
                    </p>
                    <p className="text-[#88948d]">时长：{shot.durationHint}</p>
                    {shot.voiceCue ? (
                      <p className="text-[#88948d]">对应：{shot.voiceCue}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {displayOutput.productionGuide.editGuidance.length ? (
            <>
              <h4 className="text-sm font-semibold text-[#52615a]">剪辑建议</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {displayOutput.productionGuide.editGuidance.map((tip, index) => (
                  <li key={`tip-${index}`}>{tip}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-2 p-5">
        <h3 className="font-semibold">
          可编辑全文（复制用）
          {showingOriginal ? (
            <span className="ml-2 text-xs font-normal text-[#7a8680]">
              当前为优化前只读预览
            </span>
          ) : null}
        </h3>
        <textarea
          className="min-h-64 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
          value={displayPlainText}
          readOnly={showingOriginal}
          onChange={(event) => setPlainText(event.target.value)}
        />
      </Card>

      {researchPanelMounted ? (
        <ScriptResearchPanel
          draft={draft}
          visible={researchPanelOpen}
          expanded={researchPanelExpanded}
          onExpandedChange={setResearchPanelExpanded}
          onDraftUpdated={setDraft}
          onClose={() => {
            setResearchPanelOpen(false);
            setResearchPanelExpanded(true);
          }}
        />
      ) : null}
    </div>
  );
}
