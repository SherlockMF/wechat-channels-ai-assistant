"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { ViralSample, ViralSamplePlatform } from "@video-diagnosis/shared-types";
import { Button, Card } from "@/components/ui";
import { VIRAL_SAMPLE_PLATFORM_LABELS, parseOptionalMetric } from "@/lib/viral-research/samples";

const PLATFORM_OPTIONS: ViralSamplePlatform[] = [
  "weixin_channels",
  "douyin",
  "xiaohongshu",
  "bilibili",
  "other",
];

export function ViralSampleForm() {
  const [items, setItems] = useState<ViralSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<ViralSamplePlatform>("weixin_channels");
  const [platformOther, setPlatformOther] = useState("");
  const [notes, setNotes] = useState("");
  const [structureNotes, setStructureNotes] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/viral-samples");
      const body = await response.json();
      if (response.status === 501) {
        setUnsupported(true);
        setItems([]);
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || `读取失败（${response.status}）`);
      }
      setUnsupported(false);
      setItems(body.items ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "读取爆款样本失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || !title.trim()) {
      setError("请填写链接与标题");
      return;
    }
    if (platform === "other" && !platformOther.trim()) {
      setError("平台选择「其他」时请填写平台名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const visibleMetrics: Record<string, number> = {};
      const parsedViews = parseOptionalMetric(views);
      const parsedLikes = parseOptionalMetric(likes);
      if (views.trim() && parsedViews === undefined) {
        setError("播放量请填写非负整数");
        setBusy(false);
        return;
      }
      if (likes.trim() && parsedLikes === undefined) {
        setError("点赞数请填写非负整数");
        setBusy(false);
        return;
      }
      if (parsedViews !== undefined) visibleMetrics.views = parsedViews;
      if (parsedLikes !== undefined) visibleMetrics.likes = parsedLikes;
      const response = await fetch("/api/viral-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim(),
          platform,
          ...(platform === "other" ? { platformOther: platformOther.trim() } : {}),
          ...(Object.keys(visibleMetrics).length ? { visibleMetrics } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(structureNotes.trim()
            ? { structureNotes: structureNotes.trim() }
            : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || `保存失败（${response.status}）`);
      }
      setUrl("");
      setTitle("");
      setNotes("");
      setStructureNotes("");
      setViews("");
      setLikes("");
      await loadItems();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "保存爆款样本失败",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeSample(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/viral-samples/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || `删除失败（${response.status}）`);
      }
      await loadItems();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "删除爆款样本失败",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-[#66736c]">
        <Loader2 className="animate-spin" size={16} />
        正在读取爆款样本…
      </Card>
    );
  }

  if (unsupported) {
    return (
      <Card className="p-4 text-sm text-[#66736c]">
        爆款样本库当前仅支持本地 LOCAL 模式。Sites/REAL 部署暂不支持人工录入。
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-bold text-ink">爆款样本库</h3>
        <p className="mt-1 text-xs leading-5 text-[#78857e]">
          手动录入带真实指标的参考样本；开始研究时会作为 verified_metric
          来源并入结果，供你在面板中勾选参考。
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold text-[#78857e]">视频链接</span>
          <input
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold text-[#78857e]">标题</span>
          <input
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-[#78857e]">平台</span>
          <select
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={platform}
            onChange={(event) =>
              setPlatform(event.target.value as ViralSamplePlatform)
            }
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {VIRAL_SAMPLE_PLATFORM_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        {platform === "other" ? (
          <label className="block space-y-1">
            <span className="text-xs font-bold text-[#78857e]">平台名称</span>
            <input
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
              value={platformOther}
              onChange={(event) => setPlatformOther(event.target.value)}
            />
          </label>
        ) : (
          <div className="hidden md:block" />
        )}
        <label className="block space-y-1">
          <span className="text-xs font-bold text-[#78857e]">播放（可选）</span>
          <input
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={views}
            onChange={(event) => setViews(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-[#78857e]">点赞（可选）</span>
          <input
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-pine"
            value={likes}
            onChange={(event) => setLikes(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold text-[#78857e]">备注（可选）</span>
          <textarea
            className="min-h-16 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold text-[#78857e]">
            结构拆解备注（可选）
          </span>
          <textarea
            className="min-h-16 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine"
            value={structureNotes}
            onChange={(event) => setStructureNotes(event.target.value)}
            placeholder="钩子、节奏、证据点、转化话术…"
          />
        </label>
        <div className="md:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>
            <Plus size={14} />
            保存样本
          </Button>
        </div>
      </form>

      {error ? <p className="text-sm text-coral">{error}</p> : null}

      {items.length ? (
        <ul className="space-y-2">
          {items.map((sample) => (
            <li
              key={sample.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={sample.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-ink hover:text-pine hover:underline"
                >
                  {sample.title}
                </a>
                <p className="mt-1 text-xs text-[#66736c]">
                  {VIRAL_SAMPLE_PLATFORM_LABELS[sample.platform]}
                  {sample.visibleMetrics?.views != null
                    ? ` · 播放 ${sample.visibleMetrics.views}`
                    : ""}
                  {sample.visibleMetrics?.likes != null
                    ? ` · 点赞 ${sample.visibleMetrics.likes}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void removeSample(sample.id)}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#66736c]">还没有录入样本。</p>
      )}
    </Card>
  );
}
