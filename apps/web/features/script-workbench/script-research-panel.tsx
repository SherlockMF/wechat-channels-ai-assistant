"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import type {
  ScriptDraft,
  ViralResearchItem,
  ViralResearchSnapshot,
} from "@video-diagnosis/shared-types";
import { viralResearchSnapshotSchema } from "@video-diagnosis/shared-types";
import { Badge, Button } from "@/components/ui";
import { buildResearchQuery, snapshotHasExternalItems } from "@/lib/viral-research/query";

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
};

const PRODUCTION_COST_LABELS = {
  low: "低成本",
  medium: "中等成本",
  high: "高成本",
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
      className={`rounded-xl border p-3 ${
        active ? "border-pine bg-[#f1f8f4]" : "border-line bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          id={`panel-research-${item.id}`}
          type="checkbox"
          checked={active}
          className="mt-1"
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
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
          <span className="mt-1 block text-xs text-[#7a8680]">
            {item.site ?? RESEARCH_SOURCE_LABELS[item.sourceType] ?? "来源未标注"}
          </span>
          {metrics ? (
            <p className="mt-1 text-xs text-[#52615a]">{metrics}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function resolveExistingScript(draft: ScriptDraft): string {
  return (
    draft.editedPlainText?.trim() ||
    draft.output?.script?.trim() ||
    draft.output?.plainText?.trim() ||
    draft.input.existingScript?.trim() ||
    ""
  );
}

type PanelResearchState = {
  snapshotId: string;
  selectedTopicCardId: string;
  selectedResearchItemIds: string[];
};

function panelStorageKey(draftId: string): string {
  return `script-research-panel:${draftId}`;
}

function readPanelStorage(draftId: string): PanelResearchState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(panelStorageKey(draftId));
    if (!raw) return null;
    return JSON.parse(raw) as PanelResearchState;
  } catch {
    return null;
  }
}

function writePanelStorage(draftId: string, state: PanelResearchState): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(panelStorageKey(draftId), JSON.stringify(state));
}

function resolveInitialSelections(
  draft: ScriptDraft,
  snapshot: ViralResearchSnapshot,
  stored?: Partial<PanelResearchState> | null,
): PanelResearchState {
  const selectedTopicCardId =
    stored?.selectedTopicCardId ||
    draft.input.selectedTopicCardId ||
    snapshot.topicCards[0]?.id ||
    "";
  const selectedResearchItemIds =
    stored?.selectedResearchItemIds ||
    draft.input.selectedResearchItemIds ||
    snapshot.topicCards[0]?.sourceIds.slice(0, 5) ||
    [];
  return {
    snapshotId: snapshot.id,
    selectedTopicCardId,
    selectedResearchItemIds,
  };
}

export function ScriptResearchPanel({
  draft,
  expanded,
  visible,
  onExpandedChange,
  onClose,
  onDraftUpdated,
}: {
  draft: ScriptDraft;
  expanded: boolean;
  visible: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  onDraftUpdated?: (draft: ScriptDraft) => void;
}) {
  const router = useRouter();
  const autoStarted = useRef(false);
  const [research, setResearch] = useState<ViralResearchSnapshot | null>(null);
  const [selectedTopicCardId, setSelectedTopicCardId] = useState("");
  const [selectedResearchItemIds, setSelectedResearchItemIds] = useState<string[]>([]);
  const [researchBusy, setResearchBusy] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [generateError, setGenerateError] = useState("");

  function applySnapshot(
    snapshot: ViralResearchSnapshot,
    selections?: Partial<PanelResearchState>,
  ) {
    setResearch(snapshot);
    const resolved = resolveInitialSelections(draft, snapshot, {
      snapshotId: snapshot.id,
      selectedTopicCardId: selections?.selectedTopicCardId ?? "",
      selectedResearchItemIds: selections?.selectedResearchItemIds ?? [],
    });
    setSelectedTopicCardId(resolved.selectedTopicCardId);
    setSelectedResearchItemIds(resolved.selectedResearchItemIds);
    writePanelStorage(draft.id, resolved);
  }

  async function fetchSnapshotById(
    snapshotId: string,
  ): Promise<ViralResearchSnapshot | null> {
    const response = await fetch(
      `/api/viral-research/${encodeURIComponent(snapshotId)}`,
    );
    if (!response.ok) return null;
    const body = await response.json();
    const parsed = viralResearchSnapshotSchema.safeParse(body.snapshot);
    return parsed.success ? parsed.data : null;
  }

  async function persistResearchToDraft(
    snapshot: ViralResearchSnapshot,
    selections: PanelResearchState,
  ) {
    if (!snapshotHasExternalItems(snapshot)) return;
    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            ...draft.input,
            researchSnapshotId: selections.snapshotId,
            selectedTopicCardId: selections.selectedTopicCardId || undefined,
            selectedResearchItemIds: selections.selectedResearchItemIds,
          },
        }),
      });
      const body = await response.json();
      if (response.ok && body.draft) {
        onDraftUpdated?.(body.draft as ScriptDraft);
      }
    } catch {
      // 研究快照已写入 sessionStorage，持久化失败不阻断使用。
    }
  }

  async function rememberSnapshot(snapshot: ViralResearchSnapshot) {
    const selections = resolveInitialSelections(
      draft,
      snapshot,
      readPanelStorage(draft.id),
    );
    applySnapshot(snapshot, selections);
    await persistResearchToDraft(snapshot, selections);
  }

  async function runFreshResearch(forceRefresh: boolean) {
    setLoadingMessage(
      forceRefresh
        ? "正在重新检索公开来源…"
        : "正在检索公开来源并与账号历史信号交叉整理…",
    );
    const response = await fetch("/api/viral-research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: buildResearchQuery({
            topic: draft.topic,
            topicOther: draft.topicOther,
            idea: draft.input.idea,
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
    await rememberSnapshot(parsed.data);
  }

  async function loadResearch(forceRefresh = false) {
    setResearchBusy(true);
    setResearchError("");
    try {
      if (forceRefresh) {
        await runFreshResearch(true);
        return;
      }
      const cachedSnapshotId =
        draft.input.researchSnapshotId ?? readPanelStorage(draft.id)?.snapshotId;
      if (cachedSnapshotId) {
        setLoadingMessage("正在加载上次研究结果…");
        const cached = await fetchSnapshotById(cachedSnapshotId);
        if (cached && snapshotHasExternalItems(cached)) {
          const selections = resolveInitialSelections(
            draft,
            cached,
            readPanelStorage(draft.id) ?? {
              selectedTopicCardId: draft.input.selectedTopicCardId,
              selectedResearchItemIds: draft.input.selectedResearchItemIds,
            },
          );
          applySnapshot(cached, selections);
          await persistResearchToDraft(cached, selections);
          return;
        }
        if (cached) {
          setResearchError(
            [
              cached.degradedReason,
              "上次外部联网未返回可用视频页面，正在重新检索…",
            ]
              .filter(Boolean)
              .join(" "),
          );
        }
      }
      await runFreshResearch(false);
    } catch (loadError) {
      setResearchError(
        loadError instanceof Error ? loadError.message : "研究失败，请重试",
      );
    } finally {
      setResearchBusy(false);
      setLoadingMessage("");
    }
  }

  useEffect(() => {
    if (!visible || autoStarted.current) return;
    autoStarted.current = true;
    void loadResearch(false);
  }, [visible, draft.id]);

  useEffect(() => {
    if (!research) return;
    writePanelStorage(draft.id, {
      snapshotId: research.id,
      selectedTopicCardId,
      selectedResearchItemIds,
    });
  }, [draft.id, research, selectedTopicCardId, selectedResearchItemIds]);

  const researchEvidenceGroups = useMemo(() => {
    if (!research) return [];
    return [
      {
        key: "verified",
        title: "带公开指标的外部内容",
        items: research.items.filter(
          (item) =>
            item.sourceType !== "owned_history" &&
            item.evidenceLevel === "verified_metric",
        ),
      },
      {
        key: "topic",
        title: "外部主题资料",
        items: research.items.filter(
          (item) =>
            item.sourceType !== "owned_history" &&
            item.evidenceLevel !== "verified_metric",
        ),
      },
      {
        key: "history",
        title: "本账号历史实绩",
        items: research.items.filter(
          (item) => item.sourceType === "owned_history",
        ),
      },
    ];
  }, [research]);

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

  async function generateOptimized() {
    if (!research || selectedResearchItemIds.length === 0) {
      setGenerateError("请至少选择 1 条研究参考后再生成优化稿");
      return;
    }
    setGenerateBusy(true);
    setGenerateError("");
    try {
      const existingScript = resolveExistingScript(draft);
      const input: Record<string, unknown> = {
        ...draft.input,
        rewriteMode: "polish",
        researchSnapshotId: research.id,
        selectedResearchItemIds: selectedResearchItemIds.slice(0, 5),
      };
      if (selectedTopicCardId) {
        input.selectedTopicCardId = selectedTopicCardId;
      }
      if (existingScript) {
        input.existingScript = existingScript;
      }
      const response = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: draft.format,
          topic: draft.topic,
          subTopics: draft.subTopics,
          processKinds: draft.processKinds,
          input,
          parentScriptDraftId: draft.id,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || `生成失败（${response.status}）`);
      }
      onClose();
      router.push(`/scripts/${body.draft.id}`);
    } catch (submitError) {
      setGenerateError(
        submitError instanceof Error ? submitError.message : "生成失败",
      );
    } finally {
      setGenerateBusy(false);
    }
  }

  if (!visible) {
    return null;
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-xl border border-r-0 border-line bg-white px-2 py-4 text-xs font-semibold text-pine shadow-lg hover:bg-[#f1f8f4]"
        onClick={() => onExpandedChange(true)}
      >
        <Sparkles size={16} />
        <span className="[writing-mode:vertical-rl]">爆款研究</span>
        <ChevronLeft size={14} />
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold">爆款研究</h2>
          <p className="mt-1 text-xs text-[#66736c]">
            在当前页完成研究选择与优化稿生成，不离开脚本详情。
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="rounded-lg p-2 text-[#66736c] hover:bg-fog"
            aria-label="收起面板"
            onClick={() => onExpandedChange(false)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-[#66736c] hover:bg-fog"
            aria-label="关闭面板"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {researchBusy && !research ? (
          <div className="rounded-xl border border-line bg-fog p-4 text-sm text-[#66736c]">
            {loadingMessage || "正在加载研究内容…"}
          </div>
        ) : null}

        {research && !researchBusy && snapshotHasExternalItems(research) ? (
          <p className="text-xs text-[#7a8680]">
            已恢复上次研究结果；如需重新检索请点击「刷新研究」。
          </p>
        ) : null}

        {research && !snapshotHasExternalItems(research) ? (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <p className="font-semibold">外部短视频检索未成功</p>
            <p>
              当前只有本账号历史参考（{research.provider}），DashScope
              联网没有返回可用的抖音/小红书/B站/快手/视频号页面。
            </p>
            {research.degradedReason ? (
              <p>原因：{research.degradedReason}</p>
            ) : null}
            {research.limitations.length ? (
              <ul className="list-disc space-y-1 pl-4">
                {research.limitations.slice(0, 4).map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : null}
            <p>
              请先到
              <Link href="/settings" className="mx-1 font-semibold text-pine hover:underline">
                设置 → 联网爆款研究
              </Link>
              确认已启用、Research Key 有效，且 Native API Base URL 为
              <code className="mx-1 rounded bg-white px-1">
                https://dashscope.aliyuncs.com/api/v1
              </code>
              （不要用 compatible-mode 地址）。然后点「刷新研究」重试。
            </p>
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
              <Badge tone={research.searchPerformed ? "success" : "warning"}>
                {research.searchPerformed ? "已执行外部检索" : "未完成外部检索"}
              </Badge>
              <Badge tone="neutral">{research.provider}</Badge>
            </div>

            {research.topicCards.length ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">选择研究角度</p>
                <div className="space-y-2">
                  {research.topicCards.map((card) => {
                    const active = selectedTopicCardId === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className={`block w-full rounded-xl border p-3 text-left ${
                          active
                            ? "border-pine bg-[#f1f8f4]"
                            : "border-line bg-white"
                        }`}
                        onClick={() => selectTopicCard(card.id, card.sourceIds)}
                      >
                        <span className="text-sm font-bold">{card.title}</span>
                        <span className="mt-1 block text-xs text-[#52615a]">
                          {card.originalAngle}
                        </span>
                        <span className="mt-1 block text-xs text-[#7a8680]">
                          {PRODUCTION_COST_LABELS[card.productionCost]} ·{" "}
                          {card.sourceIds.length} 条来源
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                尚未归纳出研究角度；你仍可选择下方视频/笔记链接用于优化，没有互动数字也可先点开查看。
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">选择研究参考</p>
                <span className="text-xs font-semibold text-pine">
                  已选 {selectedResearchItemIds.length} / 5
                </span>
              </div>
              {researchEvidenceGroups.map((group) => (
                <section key={group.key} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-ink">{group.title}</h3>
                    <Badge tone={group.items.length ? "neutral" : "warning"}>
                      {group.items.length} 条
                    </Badge>
                  </div>
                  {group.items.length ? (
                    <div className="space-y-2">
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

            {research.limitations.length || research.degradedReason ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                研究局限：
                {[
                  ...research.limitations,
                  ...(research.degradedReason ? [research.degradedReason] : []),
                ].join("；")}
              </div>
            ) : null}
          </>
        ) : null}

        {generateError ? (
          <p className="text-sm font-medium text-coral">{generateError}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
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
          disabled={
            !research ||
            researchBusy ||
            generateBusy ||
            selectedResearchItemIds.length === 0
          }
          onClick={() => void generateOptimized()}
        >
          {generateBusy ? "生成中…" : "生成优化稿"}
        </Button>
      </div>
    </aside>
  );
}
