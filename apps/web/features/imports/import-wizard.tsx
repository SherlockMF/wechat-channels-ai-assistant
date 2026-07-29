"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Film,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { Badge, Button, Card, Progress } from "@/components/ui";

type FormValues = {
  excel: FileList;
  videos: FileList;
};

interface Preview {
  filename: string;
  sheetName: string;
  headers: string[];
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
  sample: Array<Record<string, unknown>>;
}

const steps = ["Excel 数据", "视频文件", "自动匹配", "内容分析", "报告"];

export function ImportWizard() {
  const { register, watch, resetField } = useForm<FormValues>();
  const excel = watch("excel")?.[0];
  const videos = Array.from(watch("videos") ?? []);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const totalVideoSize = useMemo(
    () => videos.reduce((sum, file) => sum + file.size, 0),
    [videos],
  );

  async function parseExcel() {
    if (!excel) return;
    setBusy(true);
    setError("");
    setStatus("正在读取工作表与字段…");
    const data = new FormData();
    data.append("file", excel);
    const response = await fetch("/api/imports/preview", {
      method: "POST",
      body: data,
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "解析失败");
    else setPreview(body);
    setBusy(false);
    setStatus("");
  }

  async function commitImport() {
    if (!excel) return;
    setBusy(true);
    setError("");
    setStatus("正在保存有效记录…");
    const data = new FormData();
    data.append("file", excel);
    const response = await fetch("/api/imports", {
      method: "POST",
      body: data,
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "导入失败");
    else setImportId(body.import.id);
    setBusy(false);
    setStatus("");
  }

  async function uploadVideos() {
    if (!importId || videos.length === 0) return;
    setBusy(true);
    setError("");
    setUploadProgress(18);
    setStatus(`正在上传并读取 ${videos.length} 个视频元数据…`);
    const data = new FormData();
    data.append("importId", importId);
    videos.forEach((file) => data.append("files", file));
    const timer = window.setInterval(
      () => setUploadProgress((value) => Math.min(88, value + 4)),
      650,
    );
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: data,
    });
    window.clearInterval(timer);
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "上传失败");
      setUploadProgress(0);
    } else {
      setUploadProgress(100);
      setStatus(
        `匹配完成：${body.summary.matched} 条自动匹配，${body.summary.needsReview} 条待确认`,
      );
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
        {steps.map((step, index) => {
          const active =
            index === 0
              ? !importId
              : index === 1
                ? Boolean(importId && uploadProgress < 100)
                : index === 2
                  ? uploadProgress === 100
                  : false;
          const complete =
            (index === 0 && Boolean(importId)) ||
            (index === 1 && uploadProgress === 100);
          return (
            <div
              key={step}
              className={`relative px-5 py-4 ${
                active ? "bg-[#edf4ef]" : "border-l border-line first:border-l-0"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#849189]">
                0{index + 1}
              </span>
              <p
                className={`mt-1 text-sm font-bold ${
                  active ? "text-pine" : "text-[#56645d]"
                }`}
              >
                {complete ? "✓ " : ""}
                {step}
              </p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-[#edc2bc] bg-[#fff3f1] p-4 text-sm text-[#9f4035]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-6">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-pine">
                数据源
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">
                上传 Excel
              </h2>
            </div>
            <FileSpreadsheet className="text-pine" />
          </div>
          <label className="group grid min-h-44 cursor-pointer place-items-center rounded-xl border border-dashed border-[#b8c7bd] bg-[#f8faf8] p-6 text-center transition hover:border-pine hover:bg-[#f2f7f4]">
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
              <UploadCloud className="mx-auto mb-3 text-pine" size={28} />
              <span className="block text-sm font-bold">
                {excel ? excel.name : "拖放或选择视频号数据 Excel"}
              </span>
              <span className="mt-2 block text-xs text-[#748179]">
                必须包含“视频号数据明细”工作表
              </span>
            </span>
          </label>
          <div className="mt-4 flex gap-3">
            <Button onClick={parseExcel} disabled={!excel || busy || Boolean(importId)}>
              预览字段
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
        </Card>

        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-pine">
                内容源
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">
                批量上传视频
              </h2>
            </div>
            <Film className="text-pine" />
          </div>
          <label
            className={`grid min-h-44 place-items-center rounded-xl border border-dashed p-6 text-center transition ${
              importId
                ? "cursor-pointer border-[#b8c7bd] bg-[#f8faf8] hover:border-pine"
                : "cursor-not-allowed border-line bg-[#f2f3f2] opacity-65"
            }`}
          >
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              multiple
              disabled={!importId}
              className="sr-only"
              {...register("videos")}
            />
            <span>
              <UploadCloud className="mx-auto mb-3 text-pine" size={28} />
              <span className="block text-sm font-bold">
                {videos.length
                  ? `已选择 ${videos.length} 个视频`
                  : "选择 MP4、MOV 或 WebM"}
              </span>
              <span className="mt-2 block text-xs text-[#748179]">
                最多 100 个；当前{" "}
                {(totalVideoSize / 1024 / 1024).toFixed(1)} MB
              </span>
            </span>
          </label>
          <div className="mt-4">
            <Button
              onClick={uploadVideos}
              disabled={!importId || !videos.length || busy}
            >
              上传并自动匹配
            </Button>
          </div>
        </Card>
      </div>

      {preview && (
        <Card className="animate-rise overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <div>
              <h3 className="font-display text-xl font-semibold">字段预览</h3>
              <p className="mt-1 text-xs text-[#748179]">
                {preview.sheetName} · {preview.rowCount} 行
              </p>
            </div>
            <div className="flex gap-2">
              <Badge tone="success">{preview.validRowCount} 行有效</Badge>
              {preview.invalidRowCount > 0 && (
                <Badge tone="warning">
                  {preview.invalidRowCount} 项需检查
                </Badge>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_360px]">
            <div className="overflow-x-auto p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                {preview.headers.map((header) => (
                  <span
                    key={header}
                    className="rounded-md border border-line bg-fog px-2 py-1 text-xs font-semibold"
                  >
                    {header}
                  </span>
                ))}
              </div>
              <p className="text-xs leading-5 text-[#748179]">
                空值保持 NULL；日期、百分比与带分隔符数字会在服务端统一标准化。
              </p>
            </div>
            <div className="border-l border-line bg-[#fafbfa] p-6">
              <h4 className="text-sm font-bold">导入校验</h4>
              {preview.errors.length ? (
                <div className="mt-3 max-h-36 space-y-2 overflow-y-auto scrollbar-thin">
                  {preview.errors.slice(0, 8).map((item, index) => (
                    <p key={`${item.row}-${item.field}-${index}`} className="text-xs text-[#9d5d19]">
                      第 {item.row} 行 · {item.field}：{item.message}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-pine">
                  <CheckCircle2 size={16} />
                  未发现字段错误
                </p>
              )}
              <Button
                className="mt-5 w-full"
                onClick={commitImport}
                disabled={busy || Boolean(importId)}
              >
                确认导入有效记录
              </Button>
            </div>
          </div>
        </Card>
      )}

      {(busy || uploadProgress > 0) && (
        <Card className="animate-rise p-5">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-bold">{status || "处理中…"}</span>
            {uploadProgress > 0 && <span>{uploadProgress}%</span>}
          </div>
          <Progress value={uploadProgress || (busy ? 46 : 0)} />
        </Card>
      )}

      {importId && uploadProgress === 100 && (
        <Card className="animate-rise flex items-center justify-between border-[#b9d4c4] bg-[#f2f8f4] p-6">
          <div>
            <p className="font-display text-xl font-semibold text-pine">
              数据与视频已进入匹配工作台
            </p>
            <p className="mt-1 text-sm text-[#617169]">
              不确定的候选不会被强制确认，请先人工复核再创建分析任务。
            </p>
          </div>
          <Link
            href={`/imports/${importId}/matching`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-pine px-4 text-sm font-bold text-white"
          >
            检查匹配
            <ArrowRight size={16} />
          </Link>
        </Card>
      )}
    </div>
  );
}
