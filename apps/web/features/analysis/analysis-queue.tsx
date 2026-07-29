"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertCircle, Eye, LockKeyhole, Play, RefreshCw, RotateCcw } from "lucide-react";
import type { ImportedVideoRecord, VideoAsset } from "@video-diagnosis/shared-types";
import type { AnalysisJob } from "@/lib/data/types";
import { Badge, Button, Card, EmptyState, Progress } from "@/components/ui";

interface QueueRow {
  record: ImportedVideoRecord;
  asset: VideoAsset;
  job: AnalysisJob | null;
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // URL 参数仍是筛选状态的主来源；禁用存储时仅不恢复滚动位置。
  }
}

function jobStepLabel(step: string): string {
  const labels: Record<string, string> = {
    local_rule_completed: "本地规则诊断完成",
    codex_multimodal_completed: "Codex 多模态诊断完成",
    queued: "等待处理",
    completed: "分析完成",
    failed: "分析失败",
  };
  return labels[step] ?? step;
}

export function AnalysisQueue({
  initialRecent,
}: {
  initialRecent: "5" | "10" | "20" | "all";
}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [recent, setRecent] = useState<"5" | "10" | "20" | "all">(initialRecent);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const restoredScroll = useRef(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/analysis");
      if (!response.ok) throw new Error(`队列读取失败（${response.status}）`);
      setRows((await response.json()).rows);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "队列读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const hasUrlRange = new URLSearchParams(window.location.search).has("recent");
    if (!hasUrlRange) {
      const stored = readSession("analysis-recent");
      if (stored === "5" || stored === "10" || stored === "20" || stored === "all") {
        setRecent(stored);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleRows = useMemo(
    () => (recent === "all" ? rows : rows.slice(0, Number(recent))),
    [recent, rows],
  );
  const analyzableRows = useMemo(
    () => visibleRows.filter((row) => !row.job),
    [visibleRows],
  );
  const analyzableIds = useMemo(
    () => analyzableRows.map((row) => row.record.id),
    [analyzableRows],
  );
  const selectedIds = Object.entries(selected)
    .filter(([id, value]) => value && analyzableIds.includes(id))
    .map(([key]) => key);
  const allAnalyzableSelected =
    analyzableIds.length > 0 && analyzableIds.every((id) => selected[id]);

  useEffect(() => {
    const visibleIds = new Set(visibleRows.map((row) => row.record.id));
    setSelected((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id, value]) => value && visibleIds.has(id)),
      );
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [visibleRows]);

  useEffect(() => {
    if (loading || restoredScroll.current || rows.length === 0) return;
    restoredScroll.current = true;
    const saved = readSession(`analysis-scroll:${recent}`);
    if (saved) {
      window.requestAnimationFrame(() => window.scrollTo({ top: Number(saved), behavior: "instant" }));
    }
  }, [loading, recent, rows.length]);

  function changeRecent(value: typeof recent) {
    setRecent(value);
    setSelected({});
    restoredScroll.current = false;
    writeSession("analysis-recent", value);
    const url = new URL(window.location.href);
    url.searchParams.set("recent", value);
    window.history.replaceState(window.history.state, "", url);
  }

  function rememberListPosition() {
    writeSession("analysis-recent", recent);
    writeSession(`analysis-scroll:${recent}`, String(window.scrollY));
  }

  async function analyse() {
    const ids = selectedIds.length ? selectedIds : analyzableIds;
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoRecordIds: ids }),
      });
      if (!response.ok) throw new Error(`本地规则诊断失败（${response.status}）`);
      await load(true);
      setSelected({});
    } catch (analyseError) {
      setError(analyseError instanceof Error ? analyseError.message : "本地规则诊断失败");
    } finally {
      setBusy(false);
    }
  }

  async function retry(jobId: string) {
    await fetch(`/api/analysis/${jobId}/retry`, { method: "POST" });
    await load();
  }

  const columns = useMemo<ColumnDef<QueueRow>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <input
            type="checkbox"
            aria-label="选择当前范围内全部未诊断视频"
            className="h-4 w-4 accent-[#1e6650]"
            checked={allAnalyzableSelected}
            disabled={analyzableIds.length === 0}
            onChange={(event) =>
              setSelected(
                event.target.checked
                  ? Object.fromEntries(analyzableIds.map((id) => [id, true]))
                  : {},
              )
            }
          />
        ),
        cell: ({ row }) => {
          const protectedResult = Boolean(row.original.job);
          return (
            <input
              type="checkbox"
              aria-label={protectedResult ? "已有诊断结果，已保护" : `选择视频：${row.original.record.description}`}
              title={protectedResult ? "已有诊断结果；本地规则不会覆盖现有结果" : "选择进行本地规则诊断"}
              className="h-4 w-4 accent-[#1e6650] disabled:cursor-not-allowed"
              disabled={protectedResult}
              checked={Boolean(selected[row.original.record.id])}
              onChange={(event) =>
                setSelected((current) => ({
                  ...current,
                  [row.original.record.id]: event.target.checked,
                }))
              }
            />
          );
        },
      },
      {
        header: "视频",
        cell: ({ row }) => (
          <div className="max-w-[390px]">
            <p className="line-clamp-2 text-sm font-bold leading-5">
              {row.original.record.description}
            </p>
            <p className="mt-1 text-[11px] text-[#7d8982]">
              {new Date(row.original.record.publishedAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
        ),
      },
      {
        header: "整体指标",
        cell: ({ row }) => (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-[#7b877f]">播放</span>
            <b>{row.original.record.views?.toLocaleString() ?? "—"}</b>
            <span className="text-[#7b877f]">完播</span>
            <b>
              {row.original.record.completionRate === null
                ? "—"
                : `${(row.original.record.completionRate * 100).toFixed(1)}%`}
            </b>
          </div>
        ),
      },
      {
        header: "分析状态",
        cell: ({ row }) => {
          const job = row.original.job;
          if (!job) return <Badge>未创建</Badge>;
          const tone =
            job.status === "completed"
              ? "success"
              : job.status === "failed"
                ? "danger"
                : "info";
          return (
            <div className="w-36">
              <Badge tone={tone}>{jobStepLabel(job.currentStep)}</Badge>
              {job.status !== "completed" && (
                <div className="mt-2">
                  <Progress value={job.progress} />
                </div>
              )}
            </div>
          );
        },
      },
      {
        header: "操作",
        cell: ({ row }) => {
          const job = row.original.job;
          return (
            <div className="flex gap-2">
              {job?.status === "completed" && (
                <Link
                  href={`/videos/${row.original.record.id}?returnTo=${encodeURIComponent(`/analysis?recent=${recent}`)}`}
                  onClick={rememberListPosition}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-bold hover:bg-fog"
                >
                  <Eye size={13} />
                  查看
                </Link>
              )}
              {job?.status === "failed" && (
                <Button size="sm" variant="secondary" onClick={() => retry(job.id)}>
                  <RotateCcw size={13} />
                  重试
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [allAnalyzableSelected, analyzableIds, recent, selected],
  );

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <select
            aria-label="视频范围"
            value={recent}
            onChange={(event) => changeRecent(event.target.value as typeof recent)}
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-pine"
          >
            <option value="5">最近 5 条</option>
            <option value="10">最近 10 条</option>
            <option value="20">最近 20 条</option>
            <option value="all">全部已匹配</option>
          </select>
          <span className="hidden items-center gap-1.5 text-xs text-[#748179] md:flex">
            <LockKeyhole size={13} />
            已有诊断结果受保护
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            刷新
          </Button>
          <Button onClick={analyse} disabled={busy || analyzableIds.length === 0}>
            <Play size={14} />
            {busy
              ? "处理中…"
              : selectedIds.length
                ? `运行本地规则（${selectedIds.length} 条）`
                : `诊断未创建项（${analyzableIds.length} 条）`}
          </Button>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 border-b border-[#edc2bc] bg-[#fff0ee] px-6 py-3 text-sm font-semibold text-[#a53f33]">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {loading && rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="正在读取分析队列" description="正在核对工作簿、视频匹配与最新诊断状态。" />
        </div>
      ) : error && rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="无法读取分析队列" description="请检查本地服务后重试；现有诊断数据不会被修改。" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="暂无可分析视频"
            description="只有已确认匹配的视频会进入这里。先完成导入和匹配。"
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f7f9f7]">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      className="border-b border-line px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#738078]"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0 hover:bg-[#fafbfa]">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-5 py-4 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
