"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowRight, Check, Film, RefreshCw, Unlink } from "lucide-react";
import type {
  ImportedVideoRecord,
  VideoAsset,
  VideoMatch,
} from "@video-diagnosis/shared-types";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { CoverFramePicker } from "@/features/covers/cover-frame-picker";

interface Bundle {
  import: { originalFilename: string };
  records: ImportedVideoRecord[];
  assets: Array<VideoAsset & { previewUrl?: string; coverUrl?: string | null }>;
  matches: VideoMatch[];
}

interface MatchRow {
  match: VideoMatch;
  asset: VideoAsset & { previewUrl?: string; coverUrl?: string | null };
  record: ImportedVideoRecord | null;
}

function tone(status: VideoMatch["status"]) {
  return status === "matched"
    ? "success"
    : status === "needs_review"
      ? "warning"
      : "danger";
}

export function MatchWorkspace({ importId }: { importId: string }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [busyId, setBusyId] = useState("");
  const [frameAssetId, setFrameAssetId] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/imports/${importId}`);
    if (response.ok) setBundle(await response.json());
  }

  useEffect(() => {
    void load();
  }, [importId]);

  const rows = useMemo<MatchRow[]>(
    () =>
      (bundle?.matches ?? []).map((match) => ({
        match,
        asset:
          bundle?.assets.find((asset) => asset.id === match.videoAssetId) ??
          ({
            id: match.videoAssetId,
            originalFilename: "未知文件",
          } as VideoAsset),
        record:
          bundle?.records.find((record) => record.id === match.videoRecordId) ??
          null,
      })),
    [bundle],
  );

  const frameAsset = rows.find((row) => row.asset.id === frameAssetId)?.asset;

  async function confirm(matchId: string, videoRecordId: string | null) {
    setBusyId(matchId);
    await fetch(`/api/imports/${importId}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoRecordId }),
    });
    await load();
    setBusyId("");
  }

  const columns = useMemo<ColumnDef<MatchRow>[]>(
    () => [
      {
        header: "封面",
        cell: ({ row }) => (
          <div className="w-[88px]">
            {row.original.asset.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.original.asset.coverUrl}
                alt=""
                className="h-14 w-20 rounded-lg object-cover"
              />
            ) : (
              <div className="grid h-14 w-20 place-items-center rounded-lg bg-fog text-[#9aa49e]">
                <Film size={16} />
              </div>
            )}
            {row.original.asset.previewUrl && (
              <button
                type="button"
                className="mt-1 text-[11px] font-bold text-pine hover:underline"
                onClick={() => setFrameAssetId(row.original.asset.id)}
              >
                改选帧
              </button>
            )}
          </div>
        ),
      },
      {
        header: "本地视频",
        cell: ({ row }) => (
          <div className="max-w-[290px]">
            <p className="truncate text-sm font-bold" title={row.original.asset.originalFilename}>
              {row.original.asset.originalFilename}
            </p>
            <p className="mt-1 truncate text-[11px] text-[#859087]">
              {row.original.asset.normalizedFilename}
            </p>
          </div>
        ),
      },
      {
        header: "匹配记录",
        cell: ({ row }) => {
          const match = row.original.match;
          const candidate =
            row.original.record ??
            bundle?.records.find(
              (record) => record.id === match.candidates[0]?.videoRecordId,
            );
          return (
            <div className="max-w-[390px]">
              <p className="line-clamp-2 text-sm leading-5">
                {candidate?.description ?? "暂无候选"}
              </p>
              {candidate && (
                <p className="mt-1 text-[11px] text-[#859087]">
                  {new Date(candidate.publishedAt).toLocaleString("zh-CN")}
                </p>
              )}
            </div>
          );
        },
      },
      {
        header: "方法 / 相似度",
        cell: ({ row }) => (
          <div>
            <p className="text-xs font-bold">{row.original.match.method}</p>
            <p className="mt-1 font-mono text-xs text-[#64736b]">
              {(row.original.match.similarityScore * 100).toFixed(1)}%
            </p>
          </div>
        ),
      },
      {
        header: "状态",
        cell: ({ row }) => (
          <Badge tone={tone(row.original.match.status)}>
            {row.original.match.status === "matched"
              ? "已匹配"
              : row.original.match.status === "needs_review"
                ? "待确认"
                : "未匹配"}
          </Badge>
        ),
      },
      {
        header: "操作",
        cell: ({ row }) => {
          const match = row.original.match;
          const first = match.candidates[0]?.videoRecordId;
          return (
            <div className="flex gap-2">
              {match.status !== "matched" && first && (
                <Button
                  size="sm"
                  onClick={() => confirm(match.id, first)}
                  disabled={busyId === match.id}
                >
                  <Check size={13} />
                  确认首选
                </Button>
              )}
              {match.status === "matched" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => confirm(match.id, null)}
                  disabled={busyId === match.id}
                >
                  <Unlink size={13} />
                  解除
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [bundle, busyId],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const counts = {
    matched: rows.filter((row) => row.match.status === "matched").length,
    review: rows.filter((row) => row.match.status === "needs_review").length,
    unmatched: rows.filter((row) => row.match.status === "unmatched").length,
  };

  if (!bundle) {
    return (
      <Card className="grid min-h-72 place-items-center">
        <RefreshCw className="animate-spin text-pine" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {frameAsset?.previewUrl && (
        <CoverFramePicker
          videoUrl={frameAsset.previewUrl}
          durationSeconds={frameAsset.durationSeconds}
          initialSecond={frameAsset.coverFrameSecond ?? 1}
          onCancel={() => setFrameAssetId(null)}
          onConfirm={async (second, frame) => {
            const data = new FormData();
            data.append("second", String(second));
            data.append("frame", frame);
            const response = await fetch(
              `/api/assets/${frameAsset.id}/cover-from-frame`,
              {
                method: "POST",
                body: data,
              },
            );
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "截帧失败");
            setFrameAssetId(null);
            await load();
          }}
        />
      )}
      <div className="grid grid-cols-4 gap-4">
        {[
          ["已关联记录", counts.matched, "text-pine"],
          ["待确认", counts.review, "text-amber"],
          ["未关联视频", counts.unmatched, "text-coral"],
          ["Excel 记录", bundle.records.length, "text-ink"],
        ].map(([label, value, color]) => (
          <Card key={String(label)} className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#7a877f]">
              {label}
            </p>
            <p className={`mt-2 font-display text-3xl font-semibold ${color}`}>
              {value}
            </p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div>
            <h2 className="font-display text-xl font-semibold">匹配工作台</h2>
            <p className="mt-1 text-xs text-[#77847c]">
              {importId === "local-source"
                ? "关联关系来自已匹配结果工作簿，源视频不会复制或改名。"
                : "多个接近候选会保持待确认，不会自动占用记录。"}
            </p>
          </div>
          <Link
            href="/analysis"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-pine px-4 text-sm font-bold text-white"
          >
            进入数据分析
            <ArrowRight size={15} />
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="尚未上传视频"
              description="切换到「上传新批次」，或使用本地 videoes 目录。"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
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
                      <td key={cell.id} className="px-5 py-4 align-top">
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
    </div>
  );
}
