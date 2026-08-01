"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  AlertTriangle,
  FileSpreadsheet,
  Film,
  ImageIcon,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { Badge, Button, Card, Progress } from "@/components/ui";
import { fileBasename, isCoverImageFile } from "@/lib/storage/cover-client";

type FormValues = {
  excel: FileList;
  media: FileList;
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function MatchingBatchUpload({
  onCompleted,
}: {
  onCompleted: (importId: string) => void;
}) {
  const { register, watch, resetField } = useForm<FormValues>();
  const excel = watch("excel")?.[0];
  const media = Array.from(watch("media") ?? []);
  const videos = media.filter((file) => !isCoverImageFile(file));
  const covers = media.filter((file) => isCoverImageFile(file));
  const [preview, setPreview] = useState<{
    validRowCount: number;
    invalidRowCount: number;
  } | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const coverPairs = useMemo(() => {
    const coverNames = new Set(covers.map((file) => fileBasename(file.name)));
    return videos.filter((video) => coverNames.has(fileBasename(video.name))).length;
  }, [covers, videos]);

  async function parseExcel() {
    if (!excel) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", excel);
      const response = await fetch("/api/imports/preview", { method: "POST", body: data });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(String(body.error ?? "解析失败"));
      setPreview({
        validRowCount: Number(body.validRowCount ?? 0),
        invalidRowCount: Number(body.invalidRowCount ?? 0),
      });
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "解析失败");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!excel) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", excel);
      const response = await fetch("/api/imports", { method: "POST", body: data });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(String(body.error ?? "导入失败"));
      const createdImportId = String((body.import as { id?: unknown } | undefined)?.id ?? "");
      if (!createdImportId) throw new Error("导入成功但未返回批次 ID");
      setImportId(createdImportId);
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function uploadVideos() {
    if (!importId || videos.length === 0) return;
    setBusy(true);
    setError("");
    setUploadProgress(18);
    setStatus(`正在上传 ${videos.length} 个视频并自动匹配…`);
    const timer = window.setInterval(
      () => setUploadProgress((value) => Math.min(88, value + 4)),
      650,
    );
    try {
      const data = new FormData();
      data.append("importId", importId);
      videos.forEach((file) => data.append("files", file));
      covers.forEach((file) => data.append("covers", file));
      const response = await fetch("/api/uploads", { method: "POST", body: data });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(String(body.error ?? "上传失败"));
      const summary = body.summary as
        | { matched?: number; needsReview?: number }
        | undefined;
      const coverStats = body.coverStats as
        | { uploaded?: number; autoFrame?: number }
        | undefined;
      setUploadProgress(100);
      setStatus(
        `匹配完成：${summary?.matched ?? 0} 自动匹配，${summary?.needsReview ?? 0} 待确认；封面 ${coverStats?.uploaded ?? 0} 张同名配对，${coverStats?.autoFrame ?? 0} 张自动截帧`,
      );
      onCompleted(importId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
      setUploadProgress(0);
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-[#edc2bc] bg-[#fff3f1] p-4 text-sm text-[#9f4035]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">1. 上传 Excel</h2>
            <FileSpreadsheet className="text-pine" />
          </div>
          <label className="grid min-h-36 cursor-pointer place-items-center rounded-xl border border-dashed border-[#b8c7bd] bg-[#f8faf8] p-6 text-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              {...register("excel", {
                onChange: () => {
                  setPreview(null);
                  setImportId(null);
                },
              })}
            />
            <span>
              <UploadCloud className="mx-auto mb-2 text-pine" size={24} />
              <span className="block text-sm font-bold">
                {excel ? excel.name : "选择视频号数据 Excel"}
              </span>
            </span>
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void parseExcel()} disabled={!excel || busy || Boolean(importId)}>
              预览字段
            </Button>
            <Button
              onClick={() => void commitImport()}
              disabled={!preview || busy || Boolean(importId)}
            >
              确认导入
            </Button>
            {excel && !importId && (
              <Button
                variant="ghost"
                onClick={() => {
                  resetField("excel");
                  setPreview(null);
                }}
              >
                <RotateCcw size={14} />
                重选
              </Button>
            )}
          </div>
          {preview && (
            <p className="mt-3 text-sm text-[#66736c]">
              有效 {preview.validRowCount} 行，无效 {preview.invalidRowCount} 行
              {importId ? " · 已创建批次" : ""}
            </p>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">2. 上传视频与封面</h2>
            <Film className="text-pine" />
          </div>
          <label className="grid min-h-36 cursor-pointer place-items-center rounded-xl border border-dashed border-[#b8c7bd] bg-[#f8faf8] p-6 text-center">
            <input
              type="file"
              multiple
              accept=".mp4,.mov,.webm,.jpg,.jpeg,.png,.webp,video/*,image/*"
              className="sr-only"
              disabled={!importId}
              {...register("media")}
            />
            <span>
              <ImageIcon className="mx-auto mb-2 text-pine" size={24} />
              <span className="block text-sm font-bold">
                {media.length
                  ? `${videos.length} 个视频 · ${covers.length} 张封面`
                  : "选择视频，可同时选同名封面图"}
              </span>
              <span className="mt-2 block text-xs text-[#748179]">
                封面与视频同名配对，如 宣传片.mp4 ↔ 宣传片.jpg；未配对则自动截第 1 秒
              </span>
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{videos.length} 视频</Badge>
            <Badge tone="info">{coverPairs} 同名封面</Badge>
            <Badge tone="warning">{Math.max(0, videos.length - coverPairs)} 将自动截帧</Badge>
          </div>
          {busy && uploadProgress > 0 && (
            <div className="mt-4 space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-sm text-[#66736c]">{status}</p>
            </div>
          )}
          <Button
            className="mt-4"
            onClick={() => void uploadVideos()}
            disabled={!importId || videos.length === 0 || busy}
          >
            上传并自动匹配
          </Button>
        </Card>
      </div>
      {status && uploadProgress === 100 && (
        <p className="text-sm font-semibold text-pine">{status}</p>
      )}
    </div>
  );
}
