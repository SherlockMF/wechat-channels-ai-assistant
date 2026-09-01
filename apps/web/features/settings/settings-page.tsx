"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, PageHeader, cn } from "@/components/ui";
import { HotspotSection } from "@/features/settings/hotspot-section";
import type { HealthCheck } from "@/lib/settings/types";
import { defaultUserSettings } from "@/lib/settings/schema";
import type { UserSettings } from "@/lib/settings/schema";
import { normalizeContentProfile } from "@/lib/settings/content-profile";
import { PLATFORM_CATALOG } from "@/lib/platforms/catalog";
import {
  NATIVE_DASHSCOPE_RESEARCH_BASE_URL,
  describeWebResearchConfig,
  normalizeWebResearchBlock,
} from "@/lib/settings/web-research-config";

type TabId = "health" | "profile" | "api" | "guide";

type HealthResponse = {
  ok: boolean;
  allCriticalOk: boolean;
  checks: HealthCheck[];
};

const TABS: { id: TabId; label: string }[] = [
  { id: "health", label: "环境检测" },
  { id: "profile", label: "账号画像" },
  { id: "api", label: "API 配置" },
  { id: "guide", label: "首次指引" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("health");
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings());
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [dashscopeDraft, setDashscopeDraft] = useState("");

  const showWizard = !settings.setupCompleted && !settings.dismissWizard;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [settingsRes, healthRes] = await Promise.all([
        fetch("/api/settings/providers"),
        fetch("/api/settings/health"),
      ]);
      const settingsJson = (await settingsRes.json()) as {
        settings: UserSettings;
      };
      const healthJson = (await healthRes.json()) as HealthResponse;
      setSettings(settingsJson.settings);
      setDashscopeDraft(settingsJson.settings.providers.dashscopeApiKey || "");
      setHealth(healthJson);
    } catch {
      setMessage("加载设置失败，请确认服务已启动。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const criticalOk = health?.allCriticalOk ?? false;
  const apiOk = Boolean(
    health?.checks.find((c) => c.id === "api")?.ok ||
      settings.providers.dashscopeApiKey ||
      dashscopeDraft.replace(/\*/g, ""),
  );

  const saveSettings = async (next: UserSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = (await response.json()) as {
        settings?: UserSettings;
        error?: string;
      };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || "保存失败");
      }
      setSettings(payload.settings);
      setDashscopeDraft(payload.settings.providers.dashscopeApiKey || "");
      setMessage("已保存");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const applyDashscopeToAll = (base: UserSettings): UserSettings => {
    const key = dashscopeDraft.trim();
    const resolvedKey = key.includes("*")
      ? base.providers.dashscopeApiKey
      : key;
    return {
      ...base,
      providers: {
        ...base.providers,
        dashscopeApiKey: resolvedKey,
        vision: {
          ...base.providers.vision,
          provider: base.providers.vision.provider || "dashscope",
          apiKey: key.includes("*") ? base.providers.vision.apiKey : key,
        },
        llm: {
          ...base.providers.llm,
          provider: base.providers.llm.provider || "dashscope",
          apiKey: key.includes("*") ? base.providers.llm.apiKey : key,
        },
        webResearch: normalizeWebResearchBlock({
          ...base.providers.webResearch,
          apiKey: key.includes("*") ? base.providers.webResearch.apiKey : key,
        }),
        speech: {
          ...base.providers.speech,
          apiKey: key.includes("*")
            ? base.providers.speech.apiKey
            : key || base.providers.speech.apiKey,
        },
      },
    };
  };

  const guideItems = useMemo(
    () => [
      {
        ok: criticalOk,
        label: "运行环境健康（Web / 存储 / FFmpeg 等）",
      },
      { ok: apiOk, label: "已配置 API Key" },
      {
        ok: settings.setupCompleted,
        label: "完成首次指引（可稍后再标记）",
      },
    ],
    [apiOk, criticalOk, settings.setupCompleted],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#66736c]">
        <Loader2 className="animate-spin" size={16} />
        加载设置…
      </div>
    );
  }

  if (showWizard) {
    return (
      <div>
        <PageHeader
          eyebrow="Setup"
          title="首次环境引导"
          description="确认本机环境，并填写 API Key。脚本工作台可不装 FFmpeg；发布前审片需要 FFmpeg。"
        />
        <Card className="p-6">
          <div className="mb-6 flex flex-wrap gap-2 text-xs font-bold">
            {["环境检测", "API 配置", "完成"].map((label, index) => (
              <span
                key={label}
                className={cn(
                  "rounded-full border px-3 py-1",
                  wizardStep === index
                    ? "border-pine bg-[#e9f0eb] text-pine"
                    : "border-line text-[#78857e]",
                )}
              >
                {index + 1}. {label}
              </span>
            ))}
          </div>

          {wizardStep === 0 && (
            <div className="space-y-4">
              <HealthList checks={health?.checks ?? []} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void loadAll()}>
                  <RefreshCw size={14} />
                  重新检测
                </Button>
                <Button type="button" onClick={() => setWizardStep(1)}>
                  下一步：API 配置
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    void saveSettings({ ...settings, dismissWizard: true })
                  }
                >
                  跳过向导
                </Button>
              </div>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-4">
              <ApiForm
                settings={settings}
                dashscopeDraft={dashscopeDraft}
                onDashscopeDraft={setDashscopeDraft}
                onChange={setSettings}
                onApplyDashscope={() => {
                  setSettings((prev) => applyDashscopeToAll(prev));
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setWizardStep(0)}>
                  上一步
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const next = applyDashscopeToAll(settings);
                    setSettings(next);
                    await saveSettings(next);
                    setWizardStep(2);
                  }}
                >
                  <Save size={14} />
                  保存并继续
                </Button>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-[#52615a]">
                可以开始使用脚本工作台与发布前审片。需要时随时从顶栏进入「设置」。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void saveSettings({
                      ...settings,
                      setupCompleted: true,
                      dismissWizard: true,
                    })
                  }
                >
                  完成引导
                </Button>
                <Link href="/scripts">
                  <Button type="button" variant="secondary">
                    去脚本工作台
                  </Button>
                </Link>
                <Link href="/review">
                  <Button type="button" variant="secondary">
                    去发布前审片
                  </Button>
                </Link>
              </div>
            </div>
          )}
          {message && (
            <p className="mt-4 text-sm font-semibold text-pine">{message}</p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="设置"
        description="环境检测、API 配置与首次指引。本机需已安装 Node；FFmpeg 用于审片/截帧，没有也可先用脚本功能。"
        action={
          <Button type="button" variant="secondary" onClick={() => void loadAll()}>
            <RefreshCw size={14} />
            刷新
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              tab === item.id
                ? "bg-[#e9f0eb] text-pine"
                : "text-[#66736c] hover:bg-fog",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="p-6">
        {tab === "health" && <HealthList checks={health?.checks ?? []} />}

        {tab === "profile" && (
          <div className="space-y-4">
            <ContentProfileForm settings={settings} onChange={setSettings} />
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                const next = {
                  ...settings,
                  contentProfile: normalizeContentProfile(settings.contentProfile),
                };
                setSettings(next);
                void saveSettings(next);
              }}
            >
              <Save size={14} />
              保存账号画像
            </Button>
          </div>
        )}

        {tab === "api" && (
          <div className="space-y-4">
            <ApiForm
              settings={settings}
              dashscopeDraft={dashscopeDraft}
              onDashscopeDraft={setDashscopeDraft}
              onChange={setSettings}
              onApplyDashscope={() => {
                setSettings((prev) => applyDashscopeToAll(prev));
              }}
            />
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                const next = applyDashscopeToAll(settings);
                setSettings(next);
                void saveSettings(next);
              }}
            >
              <Save size={14} />
              保存 API 配置
            </Button>
          </div>
        )}

        {tab === "guide" && (
          <div className="space-y-4">
            <ul className="space-y-3">
              {guideItems.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 text-pine" size={16} />
                  ) : (
                    <Circle className="mt-0.5 text-[#9aa69f]" size={16} />
                  )}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link href="/scripts">
                <Button type="button" variant="secondary">
                  试用脚本工作台
                </Button>
              </Link>
              <Link href="/review">
                <Button type="button" variant="secondary">
                  试用发布前审片
                </Button>
              </Link>
              <Button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSettings({
                    ...settings,
                    setupCompleted: true,
                    dismissWizard: true,
                  })
                }
              >
                标记完成
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() =>
                  void saveSettings({
                    ...settings,
                    setupCompleted: false,
                    dismissWizard: false,
                  })
                }
              >
                重新打开向导
              </Button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm font-semibold text-pine">{message}</p>
        )}
      </Card>
    </div>
  );
}

function ContentProfileForm({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: (next: UserSettings) => void;
}) {
  const profile = settings.contentProfile;
  const update = (patch: Partial<UserSettings["contentProfile"]>) =>
    onChange({
      ...settings,
      contentProfile: { ...profile, ...patch },
    });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-ink">当前工作区账号画像</h3>
        <p className="mt-1 text-sm leading-6 text-[#66736c]">
          研究、选题和脚本会使用这份画像。当前是单工作区单画像；切换画像不会隔离旧稿和历史数据。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {([
          ["accountName", "账号名称", "例如：杭州租房研究所"],
          ["brandName", "品牌名称", "例如：住得好"],
          ["region", "主要地域", "例如：杭州及周边"],
        ] as const).map(([key, label, placeholder]) => (
          <label key={key} className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
              {label}
            </span>
            <input
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
              value={profile[key]}
              maxLength={80}
              placeholder={placeholder}
              onChange={(event) => update({ [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      {([
        ["positioning", "账号定位", "讲清做什么、为什么值得关注"],
        ["toneGuide", "表达语气", "例如：真实、专业、口语自然，不夸大"],
        ["ctaPolicy", "CTA 边界", "例如：自然承接内容价值，不强行索取私信"],
      ] as const).map(([key, label, placeholder]) => (
        <label key={key} className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            {label}
          </span>
          <textarea
            className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine"
            value={profile[key]}
            maxLength={300}
            placeholder={placeholder}
            onChange={(event) => update({ [key]: event.target.value })}
          />
        </label>
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            目标受众（每行一个）
          </span>
          <textarea
            className="min-h-28 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine"
            value={profile.audiences.join("\n")}
            onChange={(event) => update({ audiences: event.target.value.split("\n") })}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
            自定义主题词（逗号或换行分隔）
          </span>
          <textarea
            className="min-h-28 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine"
            value={profile.themeKeywords.join("、")}
            onChange={(event) =>
              update({ themeKeywords: event.target.value.split(/[、,，\n]/u) })
            }
          />
        </label>
      </div>
      <fieldset className="space-y-3 rounded-xl border border-line bg-fog/30 p-4">
        <legend className="px-1 text-sm font-bold text-ink">默认目标平台（最多 4 个）</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_CATALOG.map((platform) => {
            const selected = profile.defaultPlatforms.includes(platform.id);
            const limitReached = profile.defaultPlatforms.length >= 4;
            return (
              <label key={platform.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={
                    (!selected && limitReached) ||
                    (selected && profile.defaultPlatforms.length === 1)
                  }
                  onChange={(event) =>
                    update({
                      defaultPlatforms: event.target.checked
                        ? [...profile.defaultPlatforms, platform.id]
                        : profile.defaultPlatforms.filter((item) => item !== platform.id),
                    })
                  }
                />
                {platform.label}
              </label>
            );
          })}
        </div>
        {profile.defaultPlatforms.includes("other") ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-[#78857e]">其他平台名称</span>
            <input
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
              value={profile.otherPlatformName}
              maxLength={60}
              onChange={(event) => update({ otherPlatformName: event.target.value })}
            />
          </label>
        ) : null}
        <p className="text-xs leading-5 text-[#78857e]">
          当前平台能力仅用于内容策略与手工输入，不包含 OAuth、自动发布或指标同步。
        </p>
      </fieldset>
    </div>
  );
}

function HealthList({ checks }: { checks: HealthCheck[] }) {
  if (!checks.length) {
    return <p className="text-sm text-[#66736c]">暂无检测结果</p>;
  }
  return (
    <ul className="space-y-3">
      {checks.map((check) => (
        <li
          key={check.id}
          className="flex flex-col gap-1 rounded-xl border border-line bg-fog/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2">
            <Badge tone={check.ok ? "success" : "danger"}>
              {check.ok ? "就绪" : "异常"}
            </Badge>
            <span className="text-sm font-semibold text-ink">{check.label}</span>
          </div>
          <p className="text-xs leading-5 text-[#66736c] sm:max-w-xl sm:text-right">
            {check.message}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ApiForm({
  settings,
  dashscopeDraft,
  onDashscopeDraft,
  onChange,
  onApplyDashscope,
}: {
  settings: UserSettings;
  dashscopeDraft: string;
  onDashscopeDraft: (value: string) => void;
  onChange: (next: UserSettings) => void;
  onApplyDashscope: () => void;
}) {
  const updateWebResearch = (
    patch: Partial<UserSettings["providers"]["webResearch"]>,
  ) =>
    onChange({
      ...settings,
      providers: {
        ...settings.providers,
        webResearch: { ...settings.providers.webResearch, ...patch },
      },
    });

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
          阿里云百炼 API Key（可一键填到视觉/LLM）
        </span>
        <input
          className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
          value={dashscopeDraft}
          onChange={(event) => onDashscopeDraft(event.target.value)}
          placeholder="sk-..."
          autoComplete="off"
        />
      </label>
      <Button type="button" variant="secondary" size="sm" onClick={onApplyDashscope}>
        同步到视觉 / LLM / 语音 / 联网研究字段
      </Button>
      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
          Base URL
        </span>
        <input
          className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
          value={settings.providers.dashscopeApiBaseUrl}
          onChange={(event) =>
            onChange({
              ...settings,
              providers: {
                ...settings.providers,
                dashscopeApiBaseUrl: event.target.value,
              },
            })
          }
        />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["speech", "语音 Speech", "qwen-audio-3.0-asr-flash"],
            ["vision", "视觉 Vision", "qwen-vl-plus"],
            ["llm", "语言模型 LLM", "qwen-plus"],
          ] as const
        ).map(([key, label, modelPlaceholder]) => (
          <div key={key} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
                {label} Key
              </span>
              <input
                className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
                value={settings.providers[key].apiKey}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    providers: {
                      ...settings.providers,
                      [key]: {
                        ...settings.providers[key],
                        apiKey: event.target.value,
                      },
                    },
                  })
                }
                autoComplete="off"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
                {label} Model
              </span>
              <input
                className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
                value={settings.providers[key].model}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    providers: {
                      ...settings.providers,
                      [key]: {
                        ...settings.providers[key],
                        model: event.target.value,
                      },
                    },
                  })
                }
                placeholder={modelPlaceholder}
                list={`${key}-model-suggestions`}
                autoComplete="off"
              />
              <datalist id={`${key}-model-suggestions`}>
                {key === "speech" ? (
                  <>
                    <option value="qwen-audio-3.0-asr-flash" />
                    <option value="fun-asr-flash" />
                    <option value="qwen3-asr-flash" />
                  </>
                ) : key === "vision" ? (
                  <>
                    <option value="qwen-vl-plus" />
                    <option value="qwen-vl-max" />
                    <option value="qwen2.5-vl-72b-instruct" />
                  </>
                ) : (
                  <>
                    <option value="qwen-plus" />
                    <option value="qwen-plus-2025-07-28" />
                    <option value="qwen-turbo" />
                    <option value="qwen-max" />
                  </>
                )}
              </datalist>
            </label>
          </div>
        ))}
      </div>
      <section className="space-y-4 rounded-xl border border-line bg-fog/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink">联网爆款研究</h3>
            <p className="mt-1 text-xs leading-5 text-[#78857e]">
              启用后由百炼大模型联网检索公开网页（标题、链接、摘要），并归纳可复核选题；
              不等于平台官方爆款榜。默认用 qwen-plus 走 text-generation 联网；缓存按 owner 隔离 24 小时。
              额度或限流时会自动切换备选模型，并依次尝试本页 Speech / Vision / LLM / Research 各 Key 槽位。
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={settings.providers.webResearch.enabled}
              onChange={(event) =>
                updateWebResearch({ enabled: event.target.checked })
              }
            />
            启用
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
              Research Key（留空复用百炼 Key）
            </span>
            <input
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
              value={settings.providers.webResearch.apiKey}
              onChange={(event) =>
                updateWebResearch({ apiKey: event.target.value })
              }
              placeholder="sk-..."
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
              Native API Base URL
            </span>
            <input
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
              value={settings.providers.webResearch.apiBaseUrl}
              onChange={(event) =>
                updateWebResearch({ apiBaseUrl: event.target.value })
              }
              placeholder={NATIVE_DASHSCOPE_RESEARCH_BASE_URL}
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
              Research Model
            </span>
            <input
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
              value={settings.providers.webResearch.model}
              onChange={(event) =>
                updateWebResearch({ model: event.target.value })
              }
              placeholder="qwen-plus"
              list="web-research-model-suggestions"
              autoComplete="off"
            />
            <datalist id="web-research-model-suggestions">
              <option value="qwen-plus" />
              <option value="qwen-plus-2025-07-28" />
              <option value="qwen-turbo" />
              <option value="qwen-max" />
            </datalist>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#78857e]">
              跨网时效（天）
            </span>
            <input
              type="number"
              min={1}
              max={30}
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
              value={settings.providers.webResearch.freshnessDays}
              onChange={(event) =>
                updateWebResearch({ freshnessDays: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <p className="text-xs leading-5 text-[#78857e]">
          安全限制：联网 Key 只会发送到 https://dashscope.aliyuncs.com；兼容模式 Base URL 不支持来源追溯。
          保存时会自动把 compatible-mode 地址纠正为 Native API（/api/v1）。
        </p>
        <p className="rounded-lg border border-line bg-white px-3 py-2 text-xs leading-5 text-[#52615a]">
          当前配置：{describeWebResearchConfig(settings)}
        </p>
        <p className="text-xs leading-5 text-[#78857e]">
          若研究面板提示「免费额度已用尽」或「Model access denied」，请到百炼控制台充值、关闭「仅使用免费额度」，或确认 Key 有权调用所选模型与联网检索。
        </p>
      </section>
      <HotspotSection settings={settings} onChange={onChange} />
      <p className="text-xs leading-5 text-[#78857e]">
        已保存的密钥以脱敏形式显示。若不想改密钥，保留带 * 的内容即可。
        各槽位 Key 与主模型在额度/限流时会自动降级（可在 .env 用 *_MODEL_FALLBACKS、DASHSCOPE_API_KEY_FALLBACKS 覆盖）。
      </p>
    </div>
  );
}
