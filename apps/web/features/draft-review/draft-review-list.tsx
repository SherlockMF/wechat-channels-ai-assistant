"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { DraftReview } from "@video-diagnosis/shared-types";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

const statusLabel: Record<DraftReview["status"], string> = {
  uploaded: "已上传",
  processing: "分析中",
  completed: "已完成",
  failed: "失败",
};

const statusTone: Record<
  DraftReview["status"],
  "neutral" | "info" | "success" | "danger"
> = {
  uploaded: "neutral",
  processing: "info",
  completed: "success",
  failed: "danger",
};

type DraftListItem = DraftReview & { coverUrl?: string | null };

export function DraftReviewList() {
  const [items, setItems] = useState<DraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState<DraftListItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editTags, setEditTags] = useState("");
  const [actionError, setActionError] = useState("");

  async function load() {
    const response = await fetch("/api/draft-reviews");
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

  function openEdit(item: DraftListItem) {
    setEditing(item);
    setEditTitle(item.title ?? "");
    setEditGoal(item.goal ?? "");
    setEditTags((item.tags ?? []).join("、"));
    setActionError("");
  }

  async function saveEdit() {
    if (!editing) return;
    setBusyId(editing.id);
    setActionError("");
    try {
      const response = await fetch(`/api/draft-reviews/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || null,
          goal: editGoal.trim() || null,
          tags: editTags
            .split(/[,，、|/；;]+/u)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 12),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存失败");
      setEditing(null);
      await load();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setBusyId("");
    }
  }

  async function reanalyze(item: DraftListItem) {
    setBusyId(item.id);
    setActionError("");
    setItems((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, status: "processing" } : row,
      ),
    );
    try {
      const response = await fetch(`/api/draft-reviews/${item.id}/reanalyze`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "重新分析失败");
      await load();
    } catch (reanalyzeError) {
      setActionError(
        reanalyzeError instanceof Error ? reanalyzeError.message : "重新分析失败",
      );
      await load();
    } finally {
      setBusyId("");
    }
  }

  async function remove(item: DraftListItem) {
    if (!window.confirm(`确认删除「${item.title || item.originalFilename}」？此操作不可恢复。`)) {
      return;
    }
    setBusyId(item.id);
    setActionError("");
    try {
      const response = await fetch(`/api/draft-reviews/${item.id}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "删除失败");
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <Card className="min-h-48 animate-pulse" />;
  if (error) {
    return (
      <Card className="p-6">
        <EmptyState title="审片列表读取失败" description={error} />
      </Card>
    );
  }
  if (!items.length) {
    return (
      <Card className="p-6">
        <EmptyState
          title="还没有审片记录"
          description="上传刚剪好的视频，获取修改建议与账号基线对照。"
        />
        <Link
          href="/review/new"
          className="mx-auto mt-4 block w-fit rounded-lg bg-pine px-4 py-2 text-sm font-bold text-white"
        >
          上传第一条
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <p className="rounded-xl border border-[#edc2bc] bg-[#fff3f1] px-4 py-3 text-sm text-[#9f4035]">
          {actionError}
        </p>
      )}
      {items.map((item) => {
        const busy = busyId === item.id;
        return (
          <Card key={item.id} className="p-4 transition hover:border-pine/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/review/${item.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {item.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.coverUrl}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">
                    {item.title || item.originalFilename}
                  </p>
                  <p className="mt-1 text-sm text-[#66736c]">
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                    {item.versionCount > 1 ? ` · 共 ${item.versionCount} 版` : ""}
                    {item.durationSeconds
                      ? ` · ${item.durationSeconds.toFixed(1)} 秒`
                      : ""}
                    {item.goal ? ` · ${item.goal}` : ""}
                  </p>
                </div>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone[item.status]}>
                  {statusLabel[item.status]}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || item.status === "processing"}
                  onClick={() => openEdit(item)}
                >
                  <Pencil size={13} />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || item.status === "processing"}
                  onClick={() => void reanalyze(item)}
                >
                  <RefreshCw size={13} className={busy ? "animate-spin" : undefined} />
                  重新分析
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy || item.status === "processing"}
                  onClick={() => void remove(item)}
                >
                  <Trash2 size={13} />
                  删除
                </Button>
              </div>
            </div>
          </Card>
        );
      })}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6">
            <h2 className="font-display text-xl font-semibold">编辑审片信息</h2>
            <label className="block text-sm font-bold text-[#52615a]">
              标题
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm font-normal"
                placeholder="选填"
              />
            </label>
            <label className="block text-sm font-bold text-[#52615a]">
              发布目标
              <textarea
                value={editGoal}
                onChange={(event) => setEditGoal(event.target.value)}
                rows={3}
                className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm font-normal"
                placeholder="选填"
              />
            </label>
            <label className="block text-sm font-bold text-[#52615a]">
              视频标签
              <input
                value={editTags}
                onChange={(event) => setEditTags(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm font-normal"
                placeholder="逗号分隔，如：软水、装修避坑"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={busyId === editing.id}
                onClick={() => setEditing(null)}
              >
                取消
              </Button>
              <Button
                disabled={busyId === editing.id}
                onClick={() => void saveEdit()}
              >
                保存
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
