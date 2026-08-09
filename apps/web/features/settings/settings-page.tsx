"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { Badge, Button, Card, PageHeader, cn } from "@/components/ui";
import type { HealthCheck } from "@/lib/settings/types";
import { defaultUserSettings } from "@/lib/settings/schema";
import type { UserSettings } from "@/lib/settings/schema";

type TabId = "health" | "api" | "guide";

type HealthResponse = {
  ok: boolean;
  allCriticalOk: boolean;
  checks: HealthCheck[];
};

const TABS: { id: TabId; label: string }[] = [
  { id: "health", label: "环境检测" },
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

  const applyDashscopeToAll = () => {
    const key = dashscopeDraft.trim();
    setSettings((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        dashscopeApiKey: key,
        vision: {
          ...prev.providers.vision,
          provider: prev.providers.vision.provider || "dashscope",
          apiKey: key.includes("*") ? prev.providers.vision.apiKey : key,
        },
        llm: {
          ...prev.providers.llm,
          provider: prev.providers.llm.provider || "dashscope",
          apiKey: key.includes("*") ? prev.providers.llm.apiKey : key,
        },
        speech: {
          ...prev.providers.speech,
          apiKey: key.includes("*")
            ? prev.providers.speech.apiKey
            : key || prev.providers.speech.apiKey,
        },
      },
    }));
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
                onApplyDashscope={applyDashscopeToAll}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setWizardStep(0)}>
                  上一步
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    applyDashscopeToAll();
                    await saveSettings({
                      ...settings,
                      providers: {
                        ...settings.providers,
                        dashscopeApiKey: dashscopeDraft.trim() || settings.providers.dashscopeApiKey,
                      },
                    });
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

        {tab === "api" && (
          <div className="space-y-4">
            <ApiForm
              settings={settings}
              dashscopeDraft={dashscopeDraft}
              onDashscopeDraft={setDashscopeDraft}
              onChange={setSettings}
              onApplyDashscope={applyDashscopeToAll}
            />
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                applyDashscopeToAll();
                void saveSettings({
                  ...settings,
                  providers: {
                    ...settings.providers,
                    dashscopeApiKey:
                      dashscopeDraft.trim() || settings.providers.dashscopeApiKey,
                  },
                });
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
        同步到视觉 / LLM / 语音字段
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
            ["speech", "语音 Speech"],
            ["vision", "视觉 Vision"],
            ["llm", "语言模型 LLM"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-1.5">
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
        ))}
      </div>
      <p className="text-xs leading-5 text-[#78857e]">
        已保存的密钥以脱敏形式显示。若不想改密钥，保留带 * 的内容即可。
      </p>
    </div>
  );
}
