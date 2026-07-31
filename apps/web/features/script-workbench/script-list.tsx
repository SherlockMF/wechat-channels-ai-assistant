"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Trash2 } from "lucide-react";
import type { ScriptDraft, ScriptDraftFormat, ScriptDraftTopic } from "@video-diagnosis/shared-types";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import {
  SCRIPT_FORMAT_OPTIONS,
  SCRIPT_TOPIC_OPTIONS,
  formatLabel,
  topicLabel,
} from "@/lib/script-workbench/catalog";
import {
  resolveDraftListSubtitle,
  resolveDraftListTitle,
} from "@/lib/script-workbench/display";

export function ScriptList() {
  const [items, setItems] = useState<ScriptDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formatFilter, setFormatFilter] = useState<ScriptDraftFormat | "">("");
  const [topicFilter, setTopicFilter] = useState<ScriptDraftTopic | "" | "none">(
    "",
  );
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/scripts");
    if (!response.ok) throw new Error(`读取失败（${response.status}）`);
    const body = await response.json();
    setItems(body.items ?? []);
  }

  useEffect(() => {
    void load()
      .then(() => setError(""))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "读取失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (formatFilter && item.format !== formatFilter) return false;
      if (topicFilter === "none" && item.topic !== null) return false;
      if (topicFilter && topicFilter !== "none" && item.topic !== topicFilter) {
        return false;
      }
      return true;
    });
  }, [items, formatFilter, topicFilter]);

  async function copyText(item: ScriptDraft) {
    const text = item.output?.plainText || item.ideaSummary;
    await navigator.clipboard.writeText(text);
    setMessage(`已复制：${resolveDraftListTitle(item)}`);
  }

  async function remove(item: ScriptDraft) {
    if (!window.confirm(`删除脚本「${resolveDraftListTitle(item)}」？`)) {
      return;
    }
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/scripts/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("删除失败");
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "删除失败");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <Card className="p-6 text-sm text-[#66736c]">加载脚本列表…</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
          制作形态
          <select
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
            value={formatFilter}
            onChange={(event) =>
              setFormatFilter(event.target.value as ScriptDraftFormat | "")
            }
          >
            <option value="">全部</option>
            {SCRIPT_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[#52615a]">
          业务主题
          <select
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
            value={topicFilter}
            onChange={(event) =>
              setTopicFilter(
                event.target.value as ScriptDraftTopic | "" | "none",
              )
            }
          >
            <option value="">全部</option>
            <option value="none">未选主题</option>
            {SCRIPT_TOPIC_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {message ? (
          <p className="text-xs font-medium text-pine">{message}</p>
        ) : null}
        {error ? <p className="text-xs font-medium text-coral">{error}</p> : null}
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="还没有脚本"
          description="新建一条口播稿或跟拍大纲，生成后可复制到备忘录/剪映。"
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{formatLabel(item.format)}</Badge>
                  <Badge>{topicLabel(item.topic)}</Badge>
                  <Badge tone={item.status === "ready" ? "success" : "neutral"}>
                    {item.status === "ready" ? "可用" : "草稿"}
                  </Badge>
                  {item.input?.existingScript?.trim() ? (
                    <Badge tone="warning">含当前脚本</Badge>
                  ) : null}
                </div>
                <Link
                  href={`/scripts/${item.id}`}
                  className="block truncate font-display text-lg font-semibold text-ink hover:text-pine"
                >
                  {resolveDraftListTitle(item)}
                </Link>
                <p className="truncate text-sm text-[#66736c]">
                  {resolveDraftListSubtitle(item)}
                </p>
                <p className="text-[11px] text-[#88948d]">
                  更新于 {new Date(item.updatedAt).toLocaleString()}
                  {item.provider ? ` · ${item.provider}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void copyText(item)}
                >
                  <Copy size={14} />
                  复制
                </Button>
                <Link href={`/scripts/${item.id}`}>
                  <Button size="sm" variant="secondary">
                    查看
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busyId === item.id}
                  onClick={() => void remove(item)}
                >
                  <Trash2 size={14} />
                  删除
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
