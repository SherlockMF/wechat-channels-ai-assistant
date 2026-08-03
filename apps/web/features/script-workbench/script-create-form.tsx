"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ScriptDraftFormat,
  ScriptDraftProcessKind,
  ScriptDraftSmartSubTopic,
  ScriptDraftTopic,
} from "@video-diagnosis/shared-types";
import { Button, Card } from "@/components/ui";
import { SelectWithOther } from "@/components/select-with-other";
import {
  SCRIPT_FORMAT_OPTIONS,
  SCRIPT_PROCESS_OPTIONS,
  SCRIPT_SMART_SUB_OPTIONS,
  SCRIPT_TOPIC_OPTIONS,
  defaultTopicForFormat,
  isKouboFormat,
  topicRequired,
} from "@/lib/script-workbench/catalog";

const TONE_OPTIONS = [
  { value: "casual", label: "口语" },
  { value: "dry", label: "偏干货" },
] as const;

function isKnownFormat(value: string): value is ScriptDraftFormat {
  return SCRIPT_FORMAT_OPTIONS.some((item) => item.value === value);
}

function isKnownTopic(value: string): value is ScriptDraftTopic {
  return SCRIPT_TOPIC_OPTIONS.some((item) => item.value === value);
}

function resolveFormat(value: string): {
  format: ScriptDraftFormat;
  formatOther?: string;
} {
  if (isKnownFormat(value)) return { format: value };
  return { format: "other", formatOther: value.trim() };
}

function resolveTopic(value: string): {
  topic: ScriptDraftTopic | null;
  topicOther?: string;
} {
  if (!value) return { topic: null };
  if (isKnownTopic(value)) return { topic: value };
  return { topic: "other", topicOther: value.trim() };
}

function resolveTone(value: string): {
  tone: "casual" | "dry" | "other";
  toneOther?: string;
} {
  if (value === "casual" || value === "dry") return { tone: value };
  return { tone: "other", toneOther: value.trim() };
}

export function ScriptCreateForm() {
  const router = useRouter();
  /** 预设 value，或「其他」时的自定义文本 */
  const [format, setFormat] = useState("koubo");
  const [topic, setTopic] = useState<string>(
    defaultTopicForFormat("koubo") ?? "water",
  );
  const [subTopics, setSubTopics] = useState<ScriptDraftSmartSubTopic[]>([]);
  const [processKinds, setProcessKinds] = useState<ScriptDraftProcessKind[]>([
    "plan_meeting",
  ]);
  const [idea, setIdea] = useState("");
  const [existingScript, setExistingScript] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [targetSeconds, setTargetSeconds] = useState("");
  const [tone, setTone] = useState("casual");
  const [projectType, setProjectType] = useState("");
  const [shotNotes, setShotNotes] = useState("");
  const [highlight, setHighlight] = useState("");
  const [siteNotes, setSiteNotes] = useState("");
  const [standardPoints, setStandardPoints] = useState("");
  const [clientScene, setClientScene] = useState("");
  const [mustShoot, setMustShoot] = useState("");
  const [dayPlan, setDayPlan] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [shootStatus, setShootStatus] = useState<"shot" | "unshot">("unshot");
  const [materialNotes, setMaterialNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { format: resolvedFormat } = resolveFormat(format);
  const { topic: resolvedTopic } = resolveTopic(topic);
  const needsTopic = topicRequired(resolvedFormat);
  const koubo = isKouboFormat(resolvedFormat);

  const ideaPlaceholder = useMemo(() => {
    switch (resolvedFormat) {
      case "vlog":
        return "今天大概有什么，例如：巡店、写脚本、工地转一圈";
      case "service_process":
        return "例如：去某别墅验水电标准 / 跟业主谈灯光方案";
      case "project_finish":
        return "例如：凤凰湖项目突出无主灯与窗帘联动";
      case "hydro_site":
        return "例如：线管排布特别整齐的工地";
      default:
        return "例如：厨房做饭油腻不想开窗、手上脏没法拉窗帘";
    }
  }, [resolvedFormat]);

  function onFormatChange(next: string) {
    setFormat(next);
    const { format: known } = resolveFormat(next);
    const fallback = defaultTopicForFormat(known);
    if (known === "vlog" || known === "other") {
      setTopic("");
    } else if (fallback) {
      setTopic(fallback);
    } else if (!topic || !isKnownTopic(topic)) {
      setTopic("smart_home");
    }
  }

  function toggleSub(value: ScriptDraftSmartSubTopic) {
    setSubTopics((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function toggleProcess(value: ScriptDraftProcessKind) {
    setProcessKinds((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!idea.trim()) {
      setError("请先写一句想法或今日安排");
      return;
    }
    const formatPayload = resolveFormat(format);
    const topicPayload = resolveTopic(topic);
    if (formatPayload.format === "other" && !formatPayload.formatOther) {
      setError("制作形态选择「其他」时请填写自定义名称");
      return;
    }
    if (topicRequired(formatPayload.format) && !topicPayload.topic) {
      setError("该制作形态需要选择业务主题");
      return;
    }
    if (topicPayload.topic === "other" && !topicPayload.topicOther) {
      setError("业务主题选择「其他」时请填写自定义名称");
      return;
    }
    const tonePayload = resolveTone(tone);
    if (tonePayload.tone === "other" && !tonePayload.toneOther) {
      setError("语气选择「其他」时请填写自定义说明");
      return;
    }
    setBusy(true);
    try {
      const input: Record<string, unknown> = {
        idea: idea.trim(),
        shootStatus,
      };
      if (formatPayload.formatOther) {
        input.formatOther = formatPayload.formatOther;
      }
      if (topicPayload.topicOther) {
        input.topicOther = topicPayload.topicOther;
      }
      if (existingScript.trim()) input.existingScript = existingScript.trim();
      if (shootStatus === "shot" && materialNotes.trim()) {
        input.materialNotes = materialNotes.trim();
      }
      if (koubo) {
        if (sellingPoints.trim()) input.sellingPoints = sellingPoints.trim();
        if (targetSeconds.trim()) {
          input.targetSeconds = Number(targetSeconds);
        }
        input.tone = tonePayload.tone;
        if (tonePayload.toneOther) input.toneOther = tonePayload.toneOther;
      }
      if (formatPayload.format === "project_finish") {
        if (projectType.trim()) input.projectType = projectType.trim();
        if (shotNotes.trim()) input.shotNotes = shotNotes.trim();
        if (highlight.trim()) input.highlight = highlight.trim();
        if (internalNote.trim()) input.internalNote = internalNote.trim();
      }
      if (formatPayload.format === "hydro_site") {
        if (siteNotes.trim()) input.siteNotes = siteNotes.trim();
        if (standardPoints.trim()) input.standardPoints = standardPoints.trim();
      }
      if (formatPayload.format === "service_process") {
        input.processKinds = processKinds;
        if (clientScene.trim()) input.clientScene = clientScene.trim();
        if (mustShoot.trim()) input.mustShoot = mustShoot.trim();
        if (highlight.trim()) input.highlight = highlight.trim();
      }
      if (formatPayload.format === "vlog" && dayPlan.trim()) {
        input.dayPlan = dayPlan.trim();
      }

      const response = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: formatPayload.format,
          topic: topicPayload.topic,
          subTopics:
            topicPayload.topic === "smart_home" ? subTopics : [],
          processKinds:
            formatPayload.format === "service_process" ? processKinds : [],
          input,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || `生成失败（${response.status}）`);
      }
      router.push(`/scripts/${body.draft.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "生成失败",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectWithOther
            label="制作形态"
            value={format}
            onChange={onFormatChange}
            options={SCRIPT_FORMAT_OPTIONS}
            otherPlaceholder="例如：直播带货、探店测评…"
          />
          <SelectWithOther
            label={needsTopic ? "业务主题" : "业务主题（可选）"}
            value={topic}
            onChange={setTopic}
            options={SCRIPT_TOPIC_OPTIONS}
            allowEmpty={!needsTopic}
            emptyLabel="不选主题"
            otherPlaceholder="例如：中央空调、地暖…"
          />
        </div>

        {resolvedTopic === "smart_home" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#52615a]">智能子品（可多选）</p>
            <div className="flex flex-wrap gap-2">
              {SCRIPT_SMART_SUB_OPTIONS.map((option) => {
                const active = subTopics.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      active
                        ? "border-pine bg-[#eaf5ef] text-pine"
                        : "border-line bg-white text-[#52615a]"
                    }`}
                    onClick={() => toggleSub(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {resolvedFormat === "service_process" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#52615a]">过程类型</p>
            <div className="flex flex-wrap gap-2">
              {SCRIPT_PROCESS_OPTIONS.map((option) => {
                const active = processKinds.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      active
                        ? "border-pine bg-[#eaf5ef] text-pine"
                        : "border-line bg-white text-[#52615a]"
                    }`}
                    onClick={() => toggleProcess(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {koubo ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              一句话选题或画面思路
              <textarea
                className="min-h-40 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                value={idea}
                placeholder={ideaPlaceholder}
                onChange={(event) => setIdea(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              当前脚本（可选）
              <span className="font-normal text-[#88948d]">
                已写好的口播/分镜稿贴这里；系统会保留正文，主要补标题、标签和穿插素材
              </span>
              <textarea
                className="min-h-40 rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
                value={existingScript}
                placeholder={`例如：\n画面思路：厨房窗户视角…\n（0-7秒）痛点口播…\n（7-25秒）产品展示…`}
                onChange={(event) => setExistingScript(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
            {resolvedFormat === "vlog" ? "今日安排 / 想法" : "一句话选题或画面思路"}
            <textarea
              className="min-h-24 rounded-lg border border-line bg-white px-3 py-2 text-sm"
              value={idea}
              placeholder={ideaPlaceholder}
              onChange={(event) => setIdea(event.target.value)}
            />
          </label>
        )}

        {koubo ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              强调卖点（可选）
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={sellingPoints}
                onChange={(event) => setSellingPoints(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              目标时长秒（可选）
              <input
                type="number"
                min={10}
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={targetSeconds}
                onChange={(event) => setTargetSeconds(event.target.value)}
              />
            </label>
            <SelectWithOther
              label="语气"
              value={tone}
              onChange={setTone}
              options={TONE_OPTIONS}
              otherPlaceholder="例如：专业严谨、轻松幽默…"
            />
          </div>
        ) : null}

        {resolvedFormat === "project_finish" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              项目类型
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={projectType}
                placeholder="只做智控 / 全屋智能…"
                onChange={(event) => setProjectType(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              本周突出点
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={highlight}
                onChange={(event) => setHighlight(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a] md:col-span-2">
              已拍/计划画面
              <textarea
                className="min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                value={shotNotes}
                onChange={(event) => setShotNotes(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a] md:col-span-2">
              内部备注（不对外）
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {resolvedFormat === "hydro_site" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              现场亮点
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={siteNotes}
                onChange={(event) => setSiteNotes(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              标准点
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={standardPoints}
                placeholder="线管间距、固定…"
                onChange={(event) => setStandardPoints(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {resolvedFormat === "service_process" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              客户场景
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={clientScene}
                onChange={(event) => setClientScene(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              今天必拍节点
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={mustShoot}
                onChange={(event) => setMustShoot(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {resolvedFormat === "vlog" ? (
          <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
            补充日程（可选）
            <input
              className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              value={dayPlan}
              onChange={(event) => setDayPlan(event.target.value)}
            />
          </label>
        ) : null}

        <div className="space-y-3 rounded-xl border border-line bg-[#f7faf8] p-4">
          <p className="text-xs font-semibold text-[#52615a]">拍摄状态</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "unshot" as const, label: "未拍摄" },
                { value: "shot" as const, label: "已拍摄" },
              ] as const
            ).map((option) => {
              const active = shootStatus === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    active
                      ? "border-pine bg-[#eaf5ef] text-pine"
                      : "border-line bg-white text-[#52615a]"
                  }`}
                  onClick={() => setShootStatus(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs font-normal text-[#88948d]">
            {shootStatus === "shot"
              ? "将给出素材描述与剪辑建议；可选手头素材说明"
              : "将给出拍摄分镜与剪辑建议"}
          </p>
          {shootStatus === "shot" ? (
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              手头素材描述（可选）
              <textarea
                className="min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                value={materialNotes}
                placeholder="例如：客厅全景、面板操作特写、窗帘开合对比各一段…"
                onChange={(event) => setMaterialNotes(event.target.value)}
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="text-sm font-medium text-coral">{error}</p> : null}

        <Button type="submit" disabled={busy}>
          {busy ? "生成中…" : "生成脚本"}
        </Button>
      </Card>
    </form>
  );
}
