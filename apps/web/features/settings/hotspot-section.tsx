"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { HotspotSourceKind, TrackId } from "@video-diagnosis/shared-types";
import { Badge, Button } from "@/components/ui";
import {
  describeHotspotConfig,
  hotspotConfigIssues,
} from "@/lib/settings/hotspot-config";
import type { UserSettings } from "@/lib/settings/schema";
import {
  EDITABLE_HOTSPOT_SOURCE_KINDS,
  HOTSPOT_FRESHNESS_RANGE,
  HOTSPOT_ITEMS_PER_SOURCE_RANGE,
  HOTSPOT_SOURCE_KIND_LABELS,
  addHotspotSource,
  canAddHotspotSource,
  hotspotSourceLimitHint,
  hotspotSourceUrlHint,
  hotspotSourceUrlPlaceholder,
  incompleteHotspotSourceNames,
  removeHotspotSource,
  resolveEditableHotspotSources,
  restoreDefaultHotspotSources,
  rsshubBaseUrlHint,
  toggleHotspotTrackId,
  updateHotspotSource,
} from "@/lib/settings/hotspot-source-editor";
import { allTrackIds, trackLabel } from "@/lib/tracks/dictionary";

export function HotspotSection({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: (next: UserSettings) => void;
}) {
  const hotspots = settings.providers.hotspots;
  const { sources: displaySources, usingDefaults } =
    resolveEditableHotspotSources(hotspots.sources);
  const rsshubHint = rsshubBaseUrlHint(hotspots.rsshubBaseUrl);
  const incompleteNames = incompleteHotspotSourceNames(displaySources);
  const sourceLimitHint = hotspotSourceLimitHint(displaySources);

  const updateHotspots = (
    patch: Partial<UserSettings["providers"]["hotspots"]>,
  ) =>
    onChange({
      ...settings,
      providers: {
        ...settings.providers,
        hotspots: { ...hotspots, ...patch },
      },
    });

  const baseSources = () =>
    hotspots.sources.length ? hotspots.sources : restoreDefaultHotspotSources();

  const mutateSources = (
    mutator: (
      current: ReturnType<typeof baseSources>,
    ) => ReturnType<typeof baseSources>,
  ) => {
    updateHotspots({ sources: mutator(baseSources().map((source) => ({ ...source }))) });
  };

  return (
    <section className="space-y-4 rounded-xl border border-line bg-fog/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">研究热点</h3>
          <p className="mt-1 text-xs leading-5 text-[#78857e]">
            从多个新闻源与热榜抓取近期条目，按赛道过滤后给出选题建议。官方 RSS
            无需额外部署；一键启动会自动接入本机 RSSHub，用于 36氪、微博、知乎、抖音等来源。
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={hotspots.enabled}
            onChange={(event) =>
              updateHotspots({ enabled: event.target.checked })
            }
          />
          启用
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            RSSHub 地址
          </span>
          <input
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={hotspots.rsshubBaseUrl}
            onChange={(event) =>
              updateHotspots({ rsshubBaseUrl: event.target.value })
            }
            placeholder="http://127.0.0.1:1200"
            autoComplete="off"
          />
          {rsshubHint ? (
            <span className="text-xs text-coral">{rsshubHint}</span>
          ) : (
            <span className="text-xs text-[#78857e]">
              一键启动检测到本机 RSSHub 后可留空；手工填写的地址优先
            </span>
          )}
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            时效（天）
          </span>
          <input
            type="number"
            min={HOTSPOT_FRESHNESS_RANGE.min}
            max={HOTSPOT_FRESHNESS_RANGE.max}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={hotspots.freshnessDays}
            onChange={(event) =>
              updateHotspots({
                freshnessDays: Number(event.target.value),
              })
            }
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            单源条数
          </span>
          <input
            type="number"
            min={HOTSPOT_ITEMS_PER_SOURCE_RANGE.min}
            max={HOTSPOT_ITEMS_PER_SOURCE_RANGE.max}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={hotspots.maxItemsPerSource}
            onChange={(event) =>
              updateHotspots({
                maxItemsPerSource: Number(event.target.value),
              })
            }
          />
        </label>

        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            自定义主题词
          </span>
          <textarea
            className="min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine"
            value={hotspots.customKeywords.join("\n")}
            onChange={(event) =>
              updateHotspots({
                customKeywords: event.target.value.split(/\r?\n|[,，]/u),
              })
            }
            placeholder={"AI 教育\n亲子阅读\n宠物健康"}
          />
          <span className="text-xs text-[#78857e]">
            每行或逗号分隔一个主题；会与账号定位一起参与热点筛选和选题生成。
          </span>
        </label>

        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            选题模型（留空复用全局 LLM）
          </span>
          <input
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={hotspots.topicModel}
            onChange={(event) =>
              updateHotspots({ topicModel: event.target.value })
            }
            placeholder="qwen-plus"
            list="hotspot-topic-model-suggestions"
            autoComplete="off"
          />
          <datalist id="hotspot-topic-model-suggestions">
            <option value="qwen-plus" />
            <option value="qwen-turbo" />
            <option value="qwen-max" />
          </datalist>
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
          目标赛道
        </span>
        <div className="flex flex-wrap gap-3">
          {allTrackIds().map((trackId) => (
            <label
              key={trackId}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                checked={hotspots.trackIds.includes(trackId)}
                onChange={(event) =>
                  updateHotspots({
                    trackIds: toggleHotspotTrackId(
                      hotspots.trackIds,
                      trackId,
                      event.target.checked,
                    ),
                  })
                }
              />
              {trackLabel(trackId)}
            </label>
          ))}
        </div>
        {hotspots.trackIds.length === 0 &&
        !hotspots.customKeywords.some((keyword) => keyword.trim()) ? (
          <p className="text-xs text-coral">至少选择一个赛道或填写自定义主题词</p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
              热点源
            </span>
            {usingDefaults ? (
              <p className="mt-1 text-xs text-[#78857e]">
                当前使用内置默认源（编辑后将保存为自定义清单）
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                updateHotspots({ sources: restoreDefaultHotspotSources() })
              }
            >
              <RotateCcw size={14} />
              恢复默认源
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canAddHotspotSource(displaySources)}
              onClick={() =>
                mutateSources((current) => addHotspotSource(current))
              }
            >
              <Plus size={14} />
              新增源
            </Button>
          </div>
        </div>

        {sourceLimitHint ? (
          <p className="text-xs text-[#78857e]">{sourceLimitHint}</p>
        ) : null}
        {incompleteNames.length ? (
          <p className="text-xs text-coral">
            以下源名称或地址未填完整，保存时会被丢弃：
            {incompleteNames.join("、")}
          </p>
        ) : null}

        <div className="space-y-2">
          {displaySources.map((source) => (
            <div
              key={source.id}
              className="grid gap-2 rounded-lg border border-line bg-white p-3 md:grid-cols-[auto_1fr_1fr_auto_auto]"
            >
              <label className="flex items-center gap-2 self-center text-sm">
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={(event) =>
                    mutateSources((current) =>
                      updateHotspotSource(current, source.id, {
                        enabled: event.target.checked,
                      }),
                    )
                  }
                />
                启用
              </label>
              <input
                className="h-9 rounded-lg border border-line px-2 text-sm outline-none focus:border-pine"
                value={source.name}
                onChange={(event) =>
                  mutateSources((current) =>
                    updateHotspotSource(current, source.id, {
                      name: event.target.value,
                    }),
                  )
                }
                placeholder="源名称"
              />
              <input
                className="h-9 rounded-lg border border-line px-2 text-sm outline-none focus:border-pine"
                value={source.url}
                onChange={(event) =>
                  mutateSources((current) =>
                    updateHotspotSource(current, source.id, {
                      url: event.target.value,
                    }),
                  )
                }
                placeholder={hotspotSourceUrlPlaceholder(source.kind)}
              />
              {source.kind === "dashscope" ? (
                <Badge tone="neutral">{HOTSPOT_SOURCE_KIND_LABELS.dashscope}</Badge>
              ) : (
                <select
                  className="h-9 rounded-lg border border-line bg-white px-2 text-sm outline-none focus:border-pine"
                  value={source.kind}
                  onChange={(event) =>
                    mutateSources((current) =>
                      updateHotspotSource(current, source.id, {
                        kind: event.target.value as HotspotSourceKind,
                      }),
                    )
                  }
                >
                  {EDITABLE_HOTSPOT_SOURCE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {HOTSPOT_SOURCE_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={source.kind === "dashscope"}
                onClick={() =>
                  mutateSources((current) =>
                    removeHotspotSource(current, source.id),
                  )
                }
              >
                <Trash2 size={14} />
              </Button>
              <p className="md:col-span-5 text-xs text-[#78857e]">
                {hotspotSourceUrlHint(source.kind)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-line bg-white px-3 py-2 text-xs leading-5 text-[#52615a]">
        当前配置：{describeHotspotConfig(settings)}
        {hotspotConfigIssues(settings).length > 0
          ? `（${hotspotConfigIssues(settings).join("；")}）`
          : ""}
      </p>
      <p className="text-xs leading-5 text-[#78857e]">
        源失效属常态，可在仓库文档 docs/HOTSPOT_SOURCES.md 查看部署与排障说明。
      </p>
    </section>
  );
}
