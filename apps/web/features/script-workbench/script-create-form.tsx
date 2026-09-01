"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ContentPlatform,
  ScriptDraftInput,
  ScriptDraft,
  ScriptDraftFormat,
  ScriptDraftProcessKind,
  ScriptRewriteMode,
  ScriptDraftSmartSubTopic,
  ScriptDraftTopic,
  ViralResearchItem,
  ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import { viralResearchSnapshotSchema } from "@video-diagnosis/shared-types";
import { Badge, Button, Card } from "@/components/ui";
import { SelectWithOther } from "@/components/select-with-other";
import { buildResearchQuery, researchEvidenceBadgeLabel } from "@/lib/viral-research/query";
import {
  SCRIPT_FORMAT_OPTIONS,
  SCRIPT_PROCESS_OPTIONS,
  SCRIPT_SMART_SUB_OPTIONS,
  SCRIPT_TOPIC_OPTIONS,
  defaultTopicForFormat,
  formatLabel,
  isKouboFormat,
  topicLabel,
  topicRequired,
} from "@/lib/script-workbench/catalog";
import { editedSpokenBody } from "@/lib/script-workbench/plain-text";
import { PLATFORM_CATALOG } from "@/lib/platforms/catalog";

const TONE_OPTIONS = [
  { value: "casual", label: "口语" },
  { value: "dry", label: "偏干货" },
] as const;

const CONTENT_GOAL_OPTIONS: Array<{
  value: NonNullable<ScriptDraftInput["contentGoal"]>;
  label: string;
}> = [
  { value: "lead_generation", label: "引导咨询" },
  { value: "engagement", label: "评论互动" },
  { value: "education", label: "知识科普" },
  { value: "brand", label: "品牌认知" },
  { value: "other", label: "其他目标" },
];

const REWRITE_MODE_OPTIONS: Array<{
  value: ScriptRewriteMode;
  label: string;
  description: string;
}> = [
  { value: "preserve", label: "保留原稿", description: "正文不改，只给逐句意见" },
  { value: "polish", label: "适度润色", description: "保留事实与结构，优化节奏" },
  { value: "deep", label: "深度改写", description: "允许重组表达与论证顺序" },
];

type FormStep = 1 | 2 | 3;

const VISIBLE_METRIC_LABELS: Record<string, string> = {
  views: "播放",
  likes: "点赞",
  comments: "评论",
  shares: "转发",
  favorites: "收藏",
  recommends: "推荐",
};

const RESEARCH_SOURCE_LABELS: Record<string, string> = {
  dashscope: "DashScope 联网来源",
  owned_history: "账号历史",
  viral_sample: "人工录入样本",
};

const PRODUCTION_COST_LABELS = {
  low: "低成本",
  medium: "中等成本",
  high: "高成本",
} as const;

const ACCOUNT_FIT_LABELS = {
  low: "较低",
  medium: "中等",
  high: "较高",
  unknown: "未知",
} as const;

function ResearchEvidenceCard({
  item,
  active,
  onToggle,
}: {
  item: ViralResearchItem;
  active: boolean;
  onToggle: () => void;
}) {
  const metrics = Object.entries(item.visibleMetrics ?? {})
    .map(
      ([key, value]) =>
        `${VISIBLE_METRIC_LABELS[key] ?? key} ${String(value)}`,
    )
    .join(" · ");
  return (
    <div
      className={`rounded-xl border p-4 ${
        active ? "border-pine bg-[#f1f8f4]" : "border-line bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          id={`research-item-${item.id}`}
          type="checkbox"
          checked={active}
          className="mt-1"
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-ink hover:text-pine hover:underline"
              >
                {item.title}
              </a>
            ) : (
              <span className="text-sm font-bold text-ink">{item.title}</span>
            )}
            <label
              htmlFor={`research-item-${item.id}`}
              className="cursor-pointer text-xs font-semibold text-pine"
            >
              {active ? "取消选择" : "选择此参考"}
            </label>
          </div>
          <span className="mt-1 block text-xs text-[#7a8680]">
            {item.site ?? RESEARCH_SOURCE_LABELS[item.sourceType] ?? "来源未标注"}
            {item.author ? ` · ${item.author}` : ""}
            {item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ""}
          </span>
          <div className="mt-2 rounded-lg bg-fog px-3 py-2 text-xs leading-5 text-[#52615a]">
            {item.sourceType === "owned_history" ? (
              <>
                <span className="font-semibold">账号实绩与适配度：</span>
                {metrics ? `${metrics}；` : ""}
                {item.accountFit
                  ? `${ACCOUNT_FIT_LABELS[item.accountFit.level]}；${item.accountFit.reasons.join("；") || "未说明原因"}`
                  : "未评估"}
              </>
            ) : item.evidenceLevel === "verified_metric" ? (
              <>
                <span className="font-semibold">公开指标：</span>
                {metrics || "指标字段为空"}
              </>
            ) : (
              <>
                <span className="font-semibold">资料等级：</span>
                主题相关，但没有取得可验证的播放或互动指标，不能作为爆款证明。
              </>
            )}
          </div>
          {item.snippet ? (
            <span className="mt-2 line-clamp-3 block text-xs leading-5 text-[#52615a]">
              {item.snippet}
            </span>
          ) : null}
          {item.relevanceReasons.length ? (
            <span className="mt-2 block text-xs text-pine">
              相关：{item.relevanceReasons.join("；")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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

export interface HotspotSeed {
  snapshotId: string;
  clusterId?: string;
  topicCardId?: string;
  title: string;
  idea: string;
}

export function ScriptCreateForm({
  researchSourceScriptId,
  hotspotSeed,
}: {
  researchSourceScriptId?: string;
  hotspotSeed?: HotspotSeed;
}) {
  const router = useRouter();
  const researchBranch = Boolean(researchSourceScriptId);
  const [step, setStep] = useState<FormStep>(1);
  const [sourceLoading, setSourceLoading] = useState(researchBranch);
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceLoadError, setSourceLoadError] = useState("");
  const autoResearchStarted = useRef(false);
  /** 预设 value，或「其他」时的自定义文本 */
  const [format, setFormat] = useState("koubo");
  const [topic, setTopic] = useState<string>(
    defaultTopicForFormat("koubo") ?? "water",
  );
  const [subTopics, setSubTopics] = useState<ScriptDraftSmartSubTopic[]>([]);
  const [processKinds, setProcessKinds] = useState<ScriptDraftProcessKind[]>([
    "plan_meeting",
  ]);
  const [idea, setIdea] = useState(hotspotSeed?.idea ?? "");
  const [useHotspotContext, setUseHotspotContext] = useState(
    Boolean(hotspotSeed),
  );
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
  const [audience, setAudience] = useState("");
  const [targetPlatforms, setTargetPlatforms] = useState<ContentPlatform[]>([
    "weixin_channels",
  ]);
  const [platformOther, setPlatformOther] = useState("");
  const [contentGoal, setContentGoal] = useState<
    NonNullable<ScriptDraftInput["contentGoal"]>
  >("lead_generation");
  const [ctaGoal, setCtaGoal] = useState("");
  const [claimEvidence, setClaimEvidence] = useState("");
  const [rewriteMode, setRewriteMode] = useState<ScriptRewriteMode>("polish");
  const [research, setResearch] = useState<ViralResearchSnapshot | null>(null);
  const [selectedTopicCardId, setSelectedTopicCardId] = useState("");
  const [selectedResearchItemIds, setSelectedResearchItemIds] = useState<string[]>([]);
  const [useResearchContext, setUseResearchContext] = useState(false);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { format: resolvedFormat } = resolveFormat(format);
  const { topic: resolvedTopic } = resolveTopic(topic);
  const needsTopic = topicRequired(resolvedFormat);
  const koubo = isKouboFormat(resolvedFormat);
  const researchEvidenceGroups = useMemo(() => {
    if (!research) return [];
    return [
      {
        key: "verified",
        title: "人工核验指标样本",
        description: "由你手动录入并确认至少一项互动指标；系统不会从搜索结果猜测数据。",
        items: research.items.filter(
          (item) =>
            item.sourceType !== "owned_history" &&
            item.evidenceLevel === "verified_metric",
        ),
      },
      {
        key: "topic",
        title: "外部主题资料（无公开热度）",
        description: "与主题相关的视频/笔记页面；没有互动数字也可先点开链接人工查看。",
        items: research.items.filter(
          (item) =>
            item.sourceType !== "owned_history" &&
            item.evidenceLevel !== "verified_metric",
        ),
      },
      {
        key: "history",
        title: "本账号历史实绩",
        description: "使用本账号真实指标判断内容适配度，不与外部热度证据混算。",
        items: research.items.filter(
          (item) => item.sourceType === "owned_history",
        ),
      },
    ];
  }, [research]);

  useEffect(() => {
    if (researchSourceScriptId) return;
    const controller = new AbortController();
    void fetch("/api/settings/providers", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        const profile = body?.settings?.contentProfile;
        if (!profile) return;
        if (Array.isArray(profile.defaultPlatforms) && profile.defaultPlatforms.length) {
          setTargetPlatforms(profile.defaultPlatforms as ContentPlatform[]);
        }
        if (typeof profile.otherPlatformName === "string") {
          setPlatformOther(profile.otherPlatformName);
        }
        if (Array.isArray(profile.audiences) && profile.audiences.length) {
          setAudience((current) => current || profile.audiences.join("、"));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [researchSourceScriptId]);

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

  useEffect(() => {
    if (!researchSourceScriptId) return;
    const controller = new AbortController();
    autoResearchStarted.current = false;
    setSourceReady(false);
    setSourceLoading(true);
    setSourceLoadError("");
    void fetch(`/api/scripts/${encodeURIComponent(researchSourceScriptId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "读取原稿失败");
        return body.draft as ScriptDraft;
      })
      .then((draft) => {
        const input = draft.input;
        setFormat(
          draft.format === "other"
            ? draft.formatOther || draft.format
            : draft.format,
        );
        setTopic(
          draft.topic === "other"
            ? draft.topicOther || draft.topic
            : draft.topic || "",
        );
        setSubTopics(draft.subTopics);
        setProcessKinds(draft.processKinds);
        setIdea(input.idea);
        setExistingScript(
          editedSpokenBody(draft.editedPlainText, draft.output) ||
            input.existingScript ||
            "",
        );
        setSellingPoints(input.sellingPoints || "");
        setTargetSeconds(
          input.targetSeconds === undefined ? "" : String(input.targetSeconds),
        );
        setTone(
          input.tone === "other"
            ? input.toneOther || "casual"
            : input.tone || "casual",
        );
        setProjectType(input.projectType || "");
        setShotNotes(input.shotNotes || "");
        setHighlight(input.highlight || "");
        setSiteNotes(input.siteNotes || "");
        setStandardPoints(input.standardPoints || "");
        setClientScene(input.clientScene || "");
        setMustShoot(input.mustShoot || "");
        setDayPlan(input.dayPlan || "");
        setInternalNote(input.internalNote || "");
        setShootStatus(input.shootStatus || "unshot");
        setMaterialNotes(input.materialNotes || "");
        setAudience(input.audience || "");
        if (input.targetPlatforms?.length) {
          setTargetPlatforms(input.targetPlatforms);
        }
        setPlatformOther(input.platformOther || "");
        setContentGoal(input.contentGoal || "lead_generation");
        setCtaGoal(input.ctaGoal || "");
        setClaimEvidence(input.claimEvidence || "");
        setRewriteMode("polish");
        setSourceReady(true);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setSourceLoadError(
          loadError instanceof Error ? loadError.message : "读取原稿失败",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSourceLoading(false);
      });
    return () => controller.abort();
  }, [researchSourceScriptId]);

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

  function validateCore() {
    setError("");
    if (!idea.trim()) {
      setError("请先写一句想法或今日安排");
      return null;
    }
    const formatPayload = resolveFormat(format);
    const topicPayload = resolveTopic(topic);
    if (formatPayload.format === "other" && !formatPayload.formatOther) {
      setError("制作形态选择「其他」时请填写自定义名称");
      return null;
    }
    if (topicRequired(formatPayload.format) && !topicPayload.topic) {
      setError("该制作形态需要选择业务主题");
      return null;
    }
    if (topicPayload.topic === "other" && !topicPayload.topicOther) {
      setError("业务主题选择「其他」时请填写自定义名称");
      return null;
    }
    const tonePayload = resolveTone(tone);
    if (tonePayload.tone === "other" && !tonePayload.toneOther) {
      setError("语气选择「其他」时请填写自定义说明");
      return null;
    }
    return { formatPayload, topicPayload, tonePayload };
  }

  async function loadResearch(forceRefresh = false) {
    const resolved = validateCore();
    if (!resolved) return;
    setStep(2);
    setResearchBusy(true);
    setResearchError("");
    try {
      const response = await fetch("/api/viral-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: buildResearchQuery({
            topic: resolved.topicPayload.topic,
            topicOther: resolved.topicPayload.topicOther,
            idea: idea.trim(),
            audience: audience.trim() || undefined,
            contentGoal,
            targetPlatforms,
            platformOther: platformOther.trim() || undefined,
          }),
          forceRefresh,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || `研究失败（${response.status}）`);
      }
      const parsed = viralResearchSnapshotSchema.safeParse(body.snapshot ?? body);
      if (!parsed.success) throw new Error("研究结果格式无效，请刷新重试");
      setResearch(parsed.data);
      const firstTopicCard = parsed.data.topicCards[0];
      setSelectedTopicCardId(firstTopicCard?.id ?? "");
      setSelectedResearchItemIds(firstTopicCard?.sourceIds.slice(0, 5) ?? []);
      setUseResearchContext(true);
    } catch (loadError) {
      setResearchError(
        loadError instanceof Error ? loadError.message : "研究失败，请重试或跳过",
      );
    } finally {
      setResearchBusy(false);
    }
  }

  useEffect(() => {
    if (!researchBranch || !sourceReady || autoResearchStarted.current) return;
    autoResearchStarted.current = true;
    void loadResearch(false);
  }, [researchBranch, sourceReady]);

  function confirmResearch() {
    if (!research || selectedResearchItemIds.length === 0) {
      setResearchError("请至少选择 1 条研究参考后再生成优化稿");
      return;
    }
    setUseResearchContext(true);
    setStep(3);
  }

  function selectTopicCard(id: string, sourceIds: string[]) {
    setSelectedTopicCardId(id);
    setSelectedResearchItemIds(sourceIds.slice(0, 5));
    setResearchError("");
  }

  function toggleResearchItem(id: string) {
    setResearchError("");
    setSelectedResearchItemIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 5) {
        setResearchError("最多选择 5 条参考，请先取消一条");
        return current;
      }
      return [...current, id];
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (researchBranch ? step !== 3 : step !== 1) return;
    const resolved = validateCore();
    if (!resolved) return;
    if (targetPlatforms.includes("other") && !platformOther.trim()) {
      setError("选择「其他平台」时请填写平台名称");
      return;
    }
    const { formatPayload, topicPayload, tonePayload } = resolved;
    setBusy(true);
    try {
      const input: Record<string, unknown> = {
        idea: idea.trim(),
        shootStatus,
        contentGoal,
        rewriteMode,
        targetPlatforms,
      };
      if (targetPlatforms.includes("other") && platformOther.trim()) {
        input.platformOther = platformOther.trim();
      }
      if (audience.trim()) input.audience = audience.trim();
      if (ctaGoal.trim()) input.ctaGoal = ctaGoal.trim();
      if (claimEvidence.trim()) input.claimEvidence = claimEvidence.trim();
      if (useResearchContext && research) {
        input.researchSnapshotId = research.id;
        if (selectedTopicCardId) {
          input.selectedTopicCardId = selectedTopicCardId;
        }
        input.selectedResearchItemIds = selectedResearchItemIds.slice(0, 5);
      }
      if (useHotspotContext && hotspotSeed) {
        input.hotspotSnapshotId = hotspotSeed.snapshotId;
        if (hotspotSeed.clusterId) {
          input.hotspotClusterId = hotspotSeed.clusterId;
        }
        if (hotspotSeed.topicCardId) {
          input.hotspotTopicCardId = hotspotSeed.topicCardId;
        }
      }
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
          ...(researchSourceScriptId
            ? { parentScriptDraftId: researchSourceScriptId }
            : {}),
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

  if (researchBranch && sourceLoading) {
    return <Card className="p-6 text-sm text-[#66736c]">正在读取原稿并准备研究…</Card>;
  }
  if (researchBranch && sourceLoadError) {
    return (
      <Card className="space-y-3 p-6">
        <p className="text-sm text-coral">{sourceLoadError}</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(`/scripts/${researchSourceScriptId}`)}
        >
          返回原稿
        </Button>
      </Card>
    );
  }

  const flowSteps = researchBranch
    ? [
        { value: 1 as const, label: "1. 读取原稿" },
        { value: 2 as const, label: "2. 研究选择" },
        { value: 3 as const, label: "3. 另存优化稿" },
      ]
    : [
        { value: 1 as const, label: "1. 输入" },
        { value: 3 as const, label: "2. 生成结果" },
      ];

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="p-4">
        <ol
          className={`grid gap-2 text-sm ${
            researchBranch ? "sm:grid-cols-3" : "sm:grid-cols-2"
          }`}
        >
          {flowSteps.map((item) => (
            <li
              key={item.value}
              className={`rounded-lg px-3 py-2 font-semibold ${
                step === item.value
                  ? "bg-pine text-white"
                  : step > item.value
                    ? "bg-[#eaf5ef] text-pine"
                    : "bg-fog text-[#7a8680]"
              }`}
            >
              {item.label}
            </li>
          ))}
        </ol>
      </Card>

      {hotspotSeed ? (
        <Card className="space-y-2 p-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={useHotspotContext}
              onChange={(event) => setUseHotspotContext(event.target.checked)}
            />
            <span>
              <span className="font-semibold text-ink">带入热点背景</span>
              {hotspotSeed.title ? (
                <span className="ml-2 text-[#66736c]">
                  {hotspotSeed.title}
                </span>
              ) : null}
              <span className="mt-1 block text-xs text-[#7a8680]">
                热点只用于说明「为什么现在讲」，不会带来销量、参数或效果结论；快照过期后会自动忽略。
              </span>
            </span>
          </label>
        </Card>
      ) : null}

      {step === 1 ? (
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
                已写好的口播/分镜稿贴这里；下方可选择保留、润色或深度改写
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

        <div className="space-y-4 rounded-xl border border-line bg-[#f7faf8] p-4">
          <div>
            <p className="text-sm font-semibold text-ink">传播目标与证据</p>
            <p className="mt-1 text-xs text-[#7a8680]">
              用于约束钩子、标题、行动号召和事实边界，不会自动承诺传播结果。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-xs font-semibold text-[#52615a]">
                目标平台（最多 4 个）
              </legend>
              <div className="flex flex-wrap gap-3 rounded-lg border border-line bg-white p-3">
                {PLATFORM_CATALOG.map((platform) => {
                  const selected = targetPlatforms.includes(platform.id);
                  return (
                    <label key={platform.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={
                          (!selected && targetPlatforms.length >= 4) ||
                          (selected && targetPlatforms.length === 1)
                        }
                        onChange={(event) =>
                          setTargetPlatforms((current) =>
                            event.target.checked
                              ? [...current, platform.id]
                              : current.filter((item) => item !== platform.id),
                          )
                        }
                      />
                      {platform.label}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs font-normal text-[#88948d]">
                用于标题、节奏、CTA 与检索偏好；当前不包含自动发布或平台指标同步。
              </p>
            </fieldset>
            {targetPlatforms.includes("other") ? (
              <label className="grid gap-1 text-xs font-semibold text-[#52615a] md:col-span-2">
                其他平台名称
                <input
                  className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                  value={platformOther}
                  maxLength={60}
                  onChange={(event) => setPlatformOther(event.target.value)}
                />
              </label>
            ) : null}
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              目标受众（可选）
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={audience}
                placeholder="例如：正在装修、重视居住体验的本地家庭"
                onChange={(event) => setAudience(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              内容目标
              <select
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={contentGoal}
                onChange={(event) =>
                  setContentGoal(
                    event.target.value as NonNullable<
                      ScriptDraftInput["contentGoal"]
                    >,
                  )
                }
              >
                {CONTENT_GOAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
              行动号召目标（可选）
              <input
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                value={ctaGoal}
                placeholder="例如：评论户型；私信预约一次现场勘查"
                onChange={(event) => setCtaGoal(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#52615a] md:col-span-2">
              可核验事实 / 证据（可选）
              <textarea
                className="min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                value={claimEvidence}
                placeholder="例如：真实项目地址可隐去门牌；现场有施工前后对比；参数来自产品说明书第 X 页。未填写时模型不得编造参数、案例或绝对效果。"
                onChange={(event) => setClaimEvidence(event.target.value)}
              />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#52615a]">改稿方式</p>
            <div className="grid gap-2 md:grid-cols-3">
              {REWRITE_MODE_OPTIONS.map((option) => {
                const active = rewriteMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-pine bg-[#eaf5ef] text-pine"
                        : "border-line bg-white text-[#52615a]"
                    }`}
                    onClick={() => setRewriteMode(option.value)}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs font-normal">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

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

        <div className="flex flex-wrap gap-2">
          {researchBranch ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/scripts/${researchSourceScriptId}`)}
              >
                取消，返回原稿
              </Button>
              <Button
                type="button"
                disabled={researchBusy}
                onClick={() => void loadResearch(false)}
              >
                {researchBusy ? "研究中…" : "开始研究"}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={busy}>
              {busy ? "生成并质检中…" : "直接生成脚本"}
            </Button>
          )}
        </div>
      </Card>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">研究选择</h2>
              <p className="mt-1 text-sm text-[#66736c]">
                只借鉴机制、结构与可见证据；最多选择 5 条参考，不照抄标题或表达。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={researchBusy}
                onClick={() => void loadResearch(true)}
              >
                {researchBusy ? "刷新中…" : "刷新研究"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => router.push(`/scripts/${researchSourceScriptId}`)}
              >
                取消研究
              </Button>
            </div>
          </div>

          {researchBusy ? (
            <div className="rounded-xl border border-line bg-fog p-6 text-sm text-[#66736c]">
              正在检索公开来源并与账号历史信号交叉整理…
            </div>
          ) : null}

          {researchError ? (
            <p className="rounded-lg border border-[#edc2bc] bg-[#fff3f1] px-3 py-2 text-sm text-coral">
              {researchError}
            </p>
          ) : null}

          {research ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(() => {
                  const badge = researchEvidenceBadgeLabel(research);
                  return (
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  );
                })()}
                <Badge tone="neutral">{research.provider}</Badge>
                <Badge
                  tone={Date.parse(research.expiresAt) <= Date.now() ? "warning" : "neutral"}
                >
                  {Date.parse(research.expiresAt) <= Date.now()
                    ? "快照已过期"
                    : `有效至 ${new Date(research.expiresAt).toLocaleString()}`}
                </Badge>
                <span className="text-[#7a8680]">
                  获取于 {new Date(research.fetchedAt).toLocaleString()}
                </span>
              </div>

              <div className="rounded-xl border border-line bg-fog p-4 text-xs leading-5 text-[#52615a]">
                <p className="font-semibold text-ink">当前研究完成度</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={research.items.some((item) => item.sourceType !== "owned_history") ? "success" : "warning"}>
                    主题相关外部来源 {research.items.filter((item) => item.sourceType !== "owned_history").length} 条
                  </Badge>
                  <Badge tone={research.commonPatterns.length ? "success" : "warning"}>
                    已归纳共性 {research.commonPatterns.length} 条
                  </Badge>
                  <Badge tone={research.items.some((item) => item.evidenceLevel === "verified_metric") ? "success" : "warning"}>
                    人工核验指标来源 {research.items.filter((item) => item.evidenceLevel === "verified_metric").length} 条
                  </Badge>
                </div>
                <p className="mt-2">
                  至少 1 条主题相关来源即可生成有出处的研究角度；人工核验指标只代表你录入的样本，不代表整个平台热度已验证。
                </p>
              </div>

              {research.topicCards.length ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-semibold">选择一个研究角度</p>
                    <p className="mt-1 text-xs text-[#66736c]">
                      每个角度至少引用 1 条最终快照中的真实来源；来源越多、证据等级越高，结论越值得优先验证。
                    </p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    {research.topicCards.map((card) => {
                      const active = selectedTopicCardId === card.id;
                      const sources = card.sourceIds
                        .map((sourceId) =>
                          research.items.find((item) => item.id === sourceId),
                        )
                        .filter((item) => item != null);
                      return (
                        <div
                          key={card.id}
                          className={`rounded-xl border p-4 text-left transition ${
                            active
                              ? "border-pine bg-[#f1f8f4]"
                              : "border-line bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => selectTopicCard(card.id, card.sourceIds)}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-ink">
                                {card.title}
                              </span>
                              <Badge tone={active ? "success" : "neutral"}>
                                {active ? "已选择" : "选择"}
                              </Badge>
                            </span>
                            <span className="mt-2 block text-xs leading-5 text-[#52615a]">
                            {card.originalAngle}
                            </span>
                            <span className="mt-2 block text-xs text-[#7a8680]">
                              为什么现在做：{card.whyNow}
                            </span>
                          </button>
                          <dl className="mt-3 space-y-2 border-t border-line pt-3 text-xs leading-5">
                            <div>
                              <dt className="font-semibold text-[#52615a]">目标人群</dt>
                              <dd>{card.targetAudience}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-[#52615a]">可复用结构</dt>
                              <dd>{card.reusableStructures.join("；") || "未提供"}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-[#52615a]">所需证明素材</dt>
                              <dd>{card.requiredEvidence.join("；") || "未提供"}</dd>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge tone="neutral">
                                {PRODUCTION_COST_LABELS[card.productionCost]}
                              </Badge>
                              <Badge tone="neutral">{card.sourceIds.length} 条来源</Badge>
                            </div>
                            {sources.length ? (
                              <div className="flex flex-wrap gap-2">
                                {sources.map((source) =>
                                  source.url ? (
                                    <a
                                      key={source.id}
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold text-pine hover:underline"
                                    >
                                      {source.title}
                                    </a>
                                  ) : (
                                    <span key={source.id} className="text-[#7a8680]">
                                      {source.title}
                                    </span>
                                  ),
                                )}
                              </div>
                            ) : null}
                            <div>
                              <dt className="font-semibold text-[#52615a]">风险</dt>
                              <dd>{card.risks.join("；") || "未识别明确风险"}</dd>
                            </div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  本次没有生成可引用的研究角度。请调整主题或平台后重新检索，也可先录入人工样本；系统不会用无来源结论补造角度。
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">选择研究参考</p>
                    <p className="mt-1 text-xs text-[#66736c]">
                      三类资料分别展示、分别解释，不再把“主题相关”“外部热度”和“账号表现”混为一类。
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-pine">
                    已选 {selectedResearchItemIds.length} / 5
                  </span>
                </div>
                <div className="space-y-5">
                  {researchEvidenceGroups.map((group) => (
                    <section key={group.key} className="space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-ink">
                            {group.title}
                          </h3>
                          <p className="mt-1 text-xs text-[#66736c]">
                            {group.description}
                          </p>
                        </div>
                        <Badge tone={group.items.length ? "neutral" : "warning"}>
                          {group.items.length} 条
                        </Badge>
                      </div>
                      {group.items.length ? (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {group.items.map((item) => (
                            <ResearchEvidenceCard
                              key={item.id}
                              item={item}
                              active={selectedResearchItemIds.includes(item.id)}
                              onToggle={() => toggleResearchItem(item.id)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-lg bg-fog px-3 py-2 text-xs text-[#66736c]">
                          本次没有这一等级的研究结果。
                        </p>
                      )}
                    </section>
                  ))}
                </div>
                {!research.items.length ? (
                  <p className="rounded-lg bg-fog p-4 text-sm text-[#66736c]">
                    暂无可选外部条目，可刷新或跳过；生成结果会标记为未核验。
                  </p>
                ) : null}
              </div>

              {research.limitations.length || research.degradedReason ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                  研究局限：
                  {[
                    ...research.limitations,
                    ...(research.degradedReason ? [research.degradedReason] : []),
                  ].join("；")}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(`/scripts/${researchSourceScriptId}`)}
            >
              取消，返回原稿
            </Button>
            <Button
              type="button"
              disabled={
                !research || researchBusy || selectedResearchItemIds.length === 0
              }
              onClick={confirmResearch}
            >
              使用所选研究优化原稿
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="font-display text-xl font-semibold">确认并生成</h2>
            <p className="mt-1 text-sm text-[#66736c]">
              先高创造性产出，再用低温模型复核事实、结构、逐句问题和验证指标。
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-semibold text-[#7a8680]">内容输入</p>
              <p className="mt-2 font-semibold text-ink">{idea.trim()}</p>
              <p className="mt-2 text-sm text-[#52615a]">
                {formatLabel(resolvedFormat, resolveFormat(format).formatOther)} · {topicLabel(
                  resolvedTopic,
                  resolveTopic(topic).topicOther,
                )} ·{
                CONTENT_GOAL_OPTIONS.find((item) => item.value === contentGoal)?.label
              }
              </p>
              <p className="mt-1 text-xs text-[#7a8680]">
                改稿：{REWRITE_MODE_OPTIONS.find((item) => item.value === rewriteMode)?.label}
              </p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-semibold text-[#7a8680]">研究依据</p>
              {useResearchContext && research ? (
                <>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {research.topicCards.find((item) => item.id === selectedTopicCardId)?.title ||
                      "未选择选题卡"}
                  </p>
                  <p className="mt-1 text-xs text-[#52615a]">
                    已选 {selectedResearchItemIds.length} 条参考；生成时只使用对应 ID
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-[#52615a]">
                  已跳过联网研究；结果会明确标记为 skipped，不声称联网验证。
                </p>
              )}
            </div>
          </div>
          {error ? <p className="text-sm font-medium text-coral">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(useResearchContext && research ? 2 : 1)}
            >
              返回修改
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "生成并质检中…" : "另存为优化稿"}
            </Button>
          </div>
        </Card>
      ) : null}
    </form>
  );
}
