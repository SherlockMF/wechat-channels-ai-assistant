"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Download, FileDown, RefreshCw } from "lucide-react";
import type {
  ScriptDraft,
  ScriptDeliveryGuide,
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
import { ScriptEditAssist } from "@/features/script-workbench/script-edit-assist";
import { DeliveryGuidePanel } from "@/features/script-workbench/delivery-guide-panel";
import { ScriptTeleprompter } from "@/features/script-workbench/script-teleprompter";
import { useScriptAutosave } from "@/features/script-workbench/use-script-autosave";
import { captureSelection, extractPrompterText, type ScriptSelection } from "@/lib/script-workbench/editing";

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

const paceLabel = { slow: "放慢", normal: "正常", fast: "加快" } as const;
const emotionLabel: Record<string, string> = {
  neutral: "中性",
  warm: "温和",
  confident: "坚定",
  serious: "严肃",
  surprised: "惊讶",
  questioning: "提问",
  reassuring: "安抚",
};
const pauseLabel = {
  none: "不停",
  micro: "微停",
  short: "短停",
  medium: "中停",
  long: "长停",
} as const;

function deliveryGuideToText(guide: ScriptDeliveryGuide | null): string {
  if (!guide) return "";
  const lines = [
    guide.source === "ai" ? "【AI 口播演绎指导】" : guide.source === "rules" ? "【基础规则提示（非 AI）】" : "【演讲攻略】",
    `整体语气：${guide.overallTone}`,
    `语速节奏：${guide.paceHint || paceLabel[guide.overallPace]}`,
    ...(guide.cameraNote ? [`出镜提醒：${guide.cameraNote}`] : []),
    ...guide.rehearsalNotes.map((item) => `- ${item}`),
  ];
  for (const [blockIndex, block] of guide.blocks.entries()) {
    lines.push("", `【第 ${blockIndex + 1} 段原文】${block.sourceText}`);
    for (const [segmentIndex, segment] of block.segments.entries()) {
      lines.push(
        `${segmentIndex + 1}. 实际念法：${segment.spokenAs}`,
        `   语气：${segment.toneHint || `${emotionLabel[segment.emotion] ?? segment.emotion} ${segment.intensity}/3；语速：${paceLabel[segment.pace]}`}`,
        `   停顿：${segment.pauseHint || (guide.source === "ai" ? "自然衔接" : pauseLabel[segment.pauseAfter])}`,
        `   重读：${segment.emphasis.join("、") || "自然语重"}`,
      );
      for (const item of segment.pronunciation) {
        lines.push(
          `   读音：${item.text} → ${item.spokenAs}${item.needsReview ? "（需确认）" : ""}${item.note ? `；${item.note}` : ""}`,
        );
      }
      if (segment.expression) lines.push(`   表情：${segment.expression}`);
      if (segment.action) lines.push(`   动作：${segment.action}`);
    }
  }
  if (guide.warnings.length) {
    lines.push("", "【需确认】", ...guide.warnings.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

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
  const [selection, setSelection] = useState<ScriptSelection | null>(null);
  const [prompterOpen, setPrompterOpen] = useState(false);
  const [learnPrompt, setLearnPrompt] = useState(false);
  const [learning, setLearning] = useState(false);
  const [rehearsal, setRehearsal] = useState<{ scriptId: string; text: string; guide: ScriptDeliveryGuide | null } | null>(null);
  const [parentRehearsal, setParentRehearsal] = useState<ScriptDeliveryGuide | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideError, setGuideError] = useState("");
  const guideRequest = useRef<AbortController | null>(null);
  const autosave = useScriptAutosave(
    scriptId,
    draft?.id === scriptId && draft.output ? (draft.editedPlainText ?? draft.output.plainText) : null,
    plainText,
    draft?.output?.plainText ?? "",
    draft?.id === scriptId ? draft.ownerId : null,
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setDraft(null);
    setSelection(null);
    setPrompterOpen(false);
    setLearnPrompt(false);
    setMessage("");
    setRehearsal(null);
    setGuideError("");
    setGuideBusy(false);
    void fetch(`/api/scripts/${encodeURIComponent(scriptId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("读取失败");
        const body = await response.json();
        if (controller.signal.aborted) return;
        setDraft(body.draft);
        setPlainText(body.draft.editedPlainText ?? body.draft.output?.plainText ?? "");
        setRehearsal({ scriptId, text: body.draft.editedPlainText ?? body.draft.output?.plainText ?? "", guide: body.rehearsalGuide ?? null });
        setError("");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "读取失败");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); guideRequest.current?.abort(); };
  }, [scriptId]);

  useEffect(() => {
    const parentId = draft?.parentScriptDraftId;
    setParentRehearsal(null);
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
        if (!body?.draft || controller.signal.aborted) return;
        setParentDraft(body.draft as ScriptDraft);
        setParentRehearsal(body.rehearsalGuide ?? null);
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
    const ok = await autosave.flush();
    if (ok) setMessage("已保存");
    setBusy(false);
    return ok;
  }

  async function researchAndOptimize() {
    if (textDiverged && !(await save())) return;
    setResearchPanelMounted(true);
    setResearchPanelOpen(true);
    setResearchPanelExpanded(true);
  }

  async function regenerate() {
    if (!(await autosave.flush())) return;
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

  async function learnCurrentStyle() {
    if (!draft) return;
    const content = extractPrompterText(plainText);
    if (content.trim().length < 100 || content.length > 20_000) {
      setError("语气样本需要 100～20000 字口播正文；请先完善正文，或到创作资料页录入样本。");
      return;
    }
    if (!(await autosave.flush())) return;
    setLearning(true);
    setError("");
    let sampleSaved = false;
    try {
      const response = await fetch("/api/creator-studio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveSample", title: resolveDraftListTitle(draft), content, draftId: draft.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存样本失败");
      sampleSaved = true;
      const learned = await fetch("/api/creator-studio", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "learnStyle" }),
      });
      const result = await learned.json();
      if (!learned.ok) throw new Error(result.error || "学习失败");
      setMessage("当前口播稿已加入语气样本，语气档案已更新。");
      setLearnPrompt(false);
    } catch (failure) {
      setError(`${sampleSaved ? "样本已保存，学习未完成。可到创作资料页重新学习：" : ""}${failure instanceof Error ? failure.message : "学习失败"}`);
      if (sampleSaved) setLearnPrompt(false);
    } finally { setLearning(false); }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(displayPlainText);
      setMessage("已复制全文");
    } catch {
      setError("复制失败，请手动选择全文复制");
    }
  }

  async function copyDeliveryGuide() {
    const content = deliveryGuideToText(displayGuide);
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setMessage("已复制演讲攻略");
    } catch {
      setError("攻略复制失败，请手动选择复制");
    }
  }

  async function updateDeliveryGuide(mode: "ai" | "basic" = "ai") {
    const submitted = plainText;
    guideRequest.current?.abort();
    const controller = new AbortController();
    guideRequest.current = controller;
    setGuideBusy(true);
    setGuideError("");
    try {
      if (mode === "ai" && !(await autosave.flush())) throw new Error("正文尚未保存成功，请先保存后再生成口播提示");
      if (controller.signal.aborted) return;
      const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/delivery-guide`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: submitted, mode }), signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "生成口播提示失败");
      if (!controller.signal.aborted) setRehearsal({ scriptId, text: submitted, guide: body.guide });
    } catch (failure) {
      if (!controller.signal.aborted) setGuideError(failure instanceof Error ? failure.message : "生成口播提示失败");
    } finally {
      if (guideRequest.current === controller && !controller.signal.aborted) setGuideBusy(false);
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
  const displayGuide = showingOriginal ? parentRehearsal
    : rehearsal?.scriptId === scriptId && rehearsal.text === plainText ? rehearsal.guide : null;
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
            disabled={busy || showingOriginal || Boolean(autosave.recovery)}
            onClick={() => void save()}
          >
            保存修改
          </Button>
          <Button size="sm" variant="secondary" disabled={!extractPrompterText(displayPlainText)} onClick={() => setPrompterOpen(true)}>提词排练</Button>
            <Button size="sm" variant="secondary" onClick={() => document.getElementById("delivery-guide")?.scrollIntoView({ behavior: "smooth", block: "start" })}>口播语气／演讲提示</Button>
          <Button size="sm" variant="secondary" disabled={showingOriginal || learning || Boolean(autosave.recovery)} onClick={() => setLearnPrompt((open) => !open)}>学这篇的语气</Button>
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
        <p role="status" aria-live="polite" className={`text-xs ${autosave.status === "error" ? "text-coral" : "text-[#66736c]"}`}>
          {autosave.status === "saved" ? "修改已保存" : autosave.status === "saving" ? "正在保存…" : autosave.status === "error" ? `保存失败：${autosave.error}。正文仍在编辑框中，请点击“保存修改”重试。` : "有未保存修改，将自动保存"}
        </p>
        {autosave.recovery ? <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">发现这篇稿件未保存的浏览器副本</p>
          <p>修改于 {new Date(autosave.recovery.updatedAt).toLocaleString("zh-CN")}。请先选择恢复或放弃，避免覆盖尚未保存的文字。</p>
          {autosave.recovery.baseText !== (draft.editedPlainText ?? draft.output?.plainText ?? "") ? <p>服务器正文也发生过变化，恢复前请对照副本。</p> : null}
          <details><summary className="cursor-pointer font-semibold">查看恢复副本</summary><p className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-6">{autosave.recovery.text}</p></details>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => { const text = autosave.restoreRecovery(); if (text !== null) { setPlainText(text); setSelection(null); setMessage("已恢复浏览器里的修改，将重新保存。"); } }}>恢复修改</Button><Button size="sm" variant="secondary" onClick={() => autosave.discardRecovery()}>放弃副本，保留服务器版本</Button></div>
        </div> : null}
        {autosave.recoveryStorageError ? <p role="alert" className="text-xs text-coral">{autosave.recoveryStorageError}</p> : null}
        {learnPrompt ? <div className="space-y-3 rounded-xl border border-line bg-[#f4f7f5] p-4">
          <p className="text-sm">将当前口播正文加入已确认的语气样本，并调用模型提炼表达习惯。只学习语气，今后不会把这篇里的案例当成新稿事实。</p>
          <div className="flex gap-2"><Button size="sm" disabled={learning} onClick={() => void learnCurrentStyle()}>{learning ? "正在学习…" : "确认加入并学习"}</Button><Button size="sm" variant="ghost" disabled={learning} onClick={() => setLearnPrompt(false)}>取消</Button></div>
        </div> : null}
        {draft.accountProfileSnapshot || draft.creatorContextSnapshot ? <details className="rounded-xl border border-line px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[#52615a]">查看生成时的账号与素材依据</summary>
          <div className="mt-3 space-y-2 text-[#66736c]">
            {draft.accountProfileSnapshot ? <><p>账号：{draft.accountProfileSnapshot.accountName}</p><p>定位：{draft.accountProfileSnapshot.positioning}</p><p>表达要求：{draft.accountProfileSnapshot.toneGuide}</p></> : null}
            {draft.creatorContextSnapshot ? <><p>资料捕获：{new Date(draft.creatorContextSnapshot.capturedAt).toLocaleString("zh-CN")}</p><p>{draft.creatorContextSnapshot.styleDigest ? "已采用确认样本的语气档案" : "当时未使用语气学习档案"}</p>{draft.creatorContextSnapshot.section ? <p>栏目：{draft.creatorContextSnapshot.section.name}</p> : null}<p>引用素材：{draft.creatorContextSnapshot.materials.map((material) => material.title).join("、") || "无"}</p></> : null}
            <p className="text-xs">这是本稿的生成快照，修改账号设置或素材库不会改变这份记录。</p>
          </div>
        </details> : null}
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

      <DeliveryGuidePanel
        guide={displayGuide} busy={guideBusy} error={guideError}
        canGenerate={Boolean(extractPrompterText(displayPlainText)) && !autosave.recovery}
        readOnly={showingOriginal}
        onGenerate={(mode) => void updateDeliveryGuide(mode)}
        onCopy={() => void copyDeliveryGuide()}
        onCancel={() => { guideRequest.current?.abort(); setGuideBusy(false); }}
        onPrompter={() => setPrompterOpen(true)}
      />

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
          aria-label="可编辑全文"
          className="min-h-64 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
          value={displayPlainText}
          maxLength={200_000}
          readOnly={showingOriginal || Boolean(autosave.recovery)}
          onChange={(event) => setPlainText(event.target.value)}
          onSelect={(event) => {
            if (showingOriginal) return;
            const element = event.currentTarget;
            try { setSelection(captureSelection(element.value, element.selectionStart, element.selectionEnd)); }
            catch { setSelection(null); }
          }}
        />
        {!showingOriginal && !autosave.recovery ? <ScriptEditAssist key={scriptId} scriptId={scriptId} text={plainText} selection={selection} onApply={(next) => { setPlainText(next); setSelection(null); setMessage("已应用改写建议，将自动保存。"); }} /> : null}
      </Card>

      {prompterOpen ? <ScriptTeleprompter text={extractPrompterText(displayPlainText)} guide={displayGuide ?? undefined} onClose={() => setPrompterOpen(false)} /> : null}

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
