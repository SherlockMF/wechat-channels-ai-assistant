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
import {
  SCRIPT_FORMAT_OPTIONS,
  SCRIPT_PROCESS_OPTIONS,
  SCRIPT_SMART_SUB_OPTIONS,
  SCRIPT_TOPIC_OPTIONS,
  defaultTopicForFormat,
  isKouboFormat,
  topicRequired,
} from "@/lib/script-workbench/catalog";

export function ScriptCreateForm() {
  const router = useRouter();
  const [format, setFormat] = useState<ScriptDraftFormat>("koubo");
  const [topic, setTopic] = useState<ScriptDraftTopic | "">(
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
  const [tone, setTone] = useState<"casual" | "dry">("casual");
  const [projectType, setProjectType] = useState("");
  const [shotNotes, setShotNotes] = useState("");
  const [highlight, setHighlight] = useState("");
  const [siteNotes, setSiteNotes] = useState("");
  const [standardPoints, setStandardPoints] = useState("");
  const [clientScene, setClientScene] = useState("");
  const [mustShoot, setMustShoot] = useState("");
  const [dayPlan, setDayPlan] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsTopic = topicRequired(format);
  const koubo = isKouboFormat(format);

  const ideaPlaceholder = useMemo(() => {
    switch (format) {
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
  }, [format]);

  function onFormatChange(next: ScriptDraftFormat) {
    setFormat(next);
    const fallback = defaultTopicForFormat(next);
    if (next === "vlog") {
      setTopic("");
    } else if (fallback) {
      setTopic(fallback);
    } else if (!topic) {
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
    if (needsTopic && !topic) {
      setError("该制作形态需要选择业务主题");
      return;
    }
    setBusy(true);
    try {
      const input: Record<string, unknown> = { idea: idea.trim() };
      if (existingScript.trim()) input.existingScript = existingScript.trim();
      if (koubo) {
        if (sellingPoints.trim()) input.sellingPoints = sellingPoints.trim();
        if (targetSeconds.trim()) {
          input.targetSeconds = Number(targetSeconds);
        }
        input.tone = tone;
      }
      if (format === "project_finish") {
        if (projectType.trim()) input.projectType = projectType.trim();
        if (shotNotes.trim()) input.shotNotes = shotNotes.trim();
        if (highlight.trim()) input.highlight = highlight.trim();
        if (internalNote.trim()) input.internalNote = internalNote.trim();
      }
      if (format === "hydro_site") {
        if (siteNotes.trim()) input.siteNotes = siteNotes.trim();
        if (standardPoints.trim()) input.standardPoints = standardPoints.trim();
      }
      if (format === "service_process") {
        input.processKinds = processKinds;
        if (clientScene.trim()) input.clientScene = clientScene.trim();
        if (mustShoot.trim()) input.mustShoot = mustShoot.trim();
        if (highlight.trim()) input.highlight = highlight.trim();
      }
      if (format === "vlog" && dayPlan.trim()) {
        input.dayPlan = dayPlan.trim();
      }

      const response = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          topic: topic || null,
          subTopics: topic === "smart_home" ? subTopics : [],
          processKinds: format === "service_process" ? processKinds : [],
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
          <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
            制作形态
            <select
              className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              value={format}
              onChange={(event) =>
                onFormatChange(event.target.value as ScriptDraftFormat)
              }
            >
              {SCRIPT_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
            业务主题{needsTopic ? "" : "（可选）"}
            <select
              className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              value={topic}
              onChange={(event) =>
                setTopic(event.target.value as ScriptDraftTopic | "")
              }
            >
              {!needsTopic ? <option value="">不选主题</option> : null}
              {SCRIPT_TOPIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {topic === "smart_home" ? (
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

        {format === "service_process" ? (
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
            {format === "vlog" ? "今日安排 / 想法" : "一句话选题或画面思路"}
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
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              语气
              <select
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={tone}
                onChange={(event) =>
                  setTone(event.target.value as "casual" | "dry")
                }
              >
                <option value="casual">口语</option>
                <option value="dry">偏干货</option>
              </select>
            </label>
          </div>
        ) : null}

        {format === "project_finish" ? (
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

        {format === "hydro_site" ? (
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

        {format === "service_process" ? (
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

        {format === "vlog" ? (
          <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
            补充日程（可选）
            <input
              className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              value={dayPlan}
              onChange={(event) => setDayPlan(event.target.value)}
            />
          </label>
        ) : null}

        {error ? <p className="text-sm font-medium text-coral">{error}</p> : null}

        <Button type="submit" disabled={busy}>
          {busy ? "生成中…" : "生成脚本"}
        </Button>
      </Card>
    </form>
  );
}
