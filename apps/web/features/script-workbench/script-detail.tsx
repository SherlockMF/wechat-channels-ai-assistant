"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw } from "lucide-react";
import type { ScriptDraft } from "@video-diagnosis/shared-types";
import { Badge, Button, Card } from "@/components/ui";
import {
  formatLabel,
  topicLabel,
} from "@/lib/script-workbench/catalog";
import { resolveDraftListTitle } from "@/lib/script-workbench/display";
import { plainTextDivergesFromStructured } from "@/lib/script-workbench/plain-text";

export function ScriptDetail({ scriptId }: { scriptId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [plainText, setPlainText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/scripts/${scriptId}`);
    if (!response.ok) throw new Error("读取失败");
    const body = await response.json();
    setDraft(body.draft);
    setPlainText(body.draft.output?.plainText ?? "");
  }

  useEffect(() => {
    void load()
      .then(() => setError(""))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "读取失败"),
      )
      .finally(() => setLoading(false));
  }, [scriptId]);

  async function save() {
    if (!draft) return;
    if (!draft.output) {
      setError("当前稿件无结构化输出，无法保存全文");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/scripts/${scriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          output: { ...draft.output, plainText },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      setDraft(body.draft);
      setMessage("已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setBusy(false);
    }
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
      router.push(`/scripts/${body.draft.id}`);
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
      await navigator.clipboard.writeText(plainText);
      setMessage("已复制全文");
    } catch {
      setError("复制失败，请手动选择全文复制");
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
  const textDiverged =
    output != null &&
    plainTextDivergesFromStructured({ ...output, plainText });
  const providerLabel =
    draft.provider === "mock-degraded"
      ? "mock（已降级）"
      : draft.provider;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{formatLabel(draft.format)}</Badge>
          <Badge>{topicLabel(draft.topic)}</Badge>
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
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copyAll()}>
            <Copy size={14} />
            复制全文
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
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
          <Link href="/scripts">
            <Button size="sm" variant="ghost">
              返回列表
            </Button>
          </Link>
        </div>
        {message ? <p className="text-xs text-pine">{message}</p> : null}
        {error ? <p className="text-xs text-coral">{error}</p> : null}
      </Card>

      {output?.pipeline === "koubo" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">标题备选</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {output.titles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
            <h3 className="font-semibold">标签</h3>
            <p className="text-sm">{output.tags.map((tag) => `#${tag}`).join(" ")}</p>
            <h3 className="font-semibold">口播稿</h3>
            <p className="whitespace-pre-wrap text-sm leading-7">{output.script}</p>
          </Card>
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">穿插素材</h3>
            <ul className="space-y-2 text-sm">
              {output.brollCues.map((cue) => (
                <li key={`${cue.section}-${cue.cue}`}>
                  <span className="font-semibold">{cue.section}：</span>
                  {cue.cue}
                </li>
              ))}
            </ul>
            <h3 className="font-semibold">字幕要点</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {output.subtitleBeats.map((beat) => (
                <li key={beat}>{beat}</li>
              ))}
            </ul>
            <h3 className="font-semibold">备选开头</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {output.altHooks.map((hook) => (
                <li key={hook}>{hook}</li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {output?.pipeline === "follow" ? (
        <Card className="space-y-3 p-5">
          {output.positioning ? (
            <>
              <h3 className="font-semibold">本片定位</h3>
              <p className="text-sm">{output.positioning}</p>
            </>
          ) : null}
          <h3 className="font-semibold">拍摄/剪辑顺序</h3>
          <ol className="space-y-3 text-sm">
            {output.timeline.map((step) => (
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
          {output.gapsOrWarnings.length ? (
            <>
              <h3 className="font-semibold">补拍/注意</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {output.gapsOrWarnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {output?.productionGuide ? (
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">拍摄与剪辑指导</h3>
            <Badge
              tone={
                output.productionGuide.shootStatus === "shot"
                  ? "info"
                  : "neutral"
              }
            >
              {output.productionGuide.shootStatus === "shot"
                ? "已拍摄"
                : "未拍摄"}
            </Badge>
          </div>

          {output.productionGuide.shootStatus === "shot" &&
          output.productionGuide.materials.length ? (
            <>
              <h4 className="text-sm font-semibold text-[#52615a]">素材描述</h4>
              <ul className="space-y-2 text-sm">
                {output.productionGuide.materials.map((item, index) => (
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

          {output.productionGuide.shootStatus === "unshot" &&
          output.productionGuide.storyboard.length ? (
            <>
              <h4 className="text-sm font-semibold text-[#52615a]">拍摄分镜</h4>
              <ol className="space-y-3 text-sm">
                {output.productionGuide.storyboard.map((shot, index) => (
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

          {output.productionGuide.editGuidance.length ? (
            <>
              <h4 className="text-sm font-semibold text-[#52615a]">剪辑建议</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {output.productionGuide.editGuidance.map((tip, index) => (
                  <li key={`tip-${index}`}>{tip}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-2 p-5">
        <h3 className="font-semibold">可编辑全文（复制用）</h3>
        <textarea
          className="min-h-64 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
          value={plainText}
          onChange={(event) => setPlainText(event.target.value)}
        />
      </Card>
    </div>
  );
}
