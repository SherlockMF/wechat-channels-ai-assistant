"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { Button, Card, Progress } from "@/components/ui";

function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/u, "");
  return base.replace(/\.[^.]+$/u, "").trim();
}

export function DraftReviewUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [tags, setTags] = useState("");
  const [tagsSource, setTagsSource] = useState<"llm" | "heuristic" | "manual" | "">("");
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const tagsAutoRef = useRef(true);
  const suggestSeqRef = useRef(0);

  async function suggestTags(forTitle: string) {
    const trimmed = forTitle.trim();
    if (!trimmed) return;
    const seq = ++suggestSeqRef.current;
    setSuggestingTags(true);
    try {
      const response = await fetch("/api/draft-reviews/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const body = (await response.json()) as {
        tags?: string[];
        source?: "llm" | "heuristic";
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "标签归纳失败");
      if (seq !== suggestSeqRef.current || !tagsAutoRef.current) return;
      const next = (body.tags ?? []).join("、");
      if (next) {
        setTags(next);
        setTagsSource(body.source ?? "llm");
      }
    } catch {
      // 归纳失败不阻断上传；保留用户已有标签
    } finally {
      if (seq === suggestSeqRef.current) setSuggestingTags(false);
    }
  }

  function onVideoSelected(next: File | null) {
    setFile(next);
    if (!next) return;
    const derived = titleFromFilename(next.name);
    if (derived) {
      tagsAutoRef.current = true;
      setTitle(derived);
    }
  }

  useEffect(() => {
    if (!title.trim() || !tagsAutoRef.current) return;
    const handle = window.setTimeout(() => {
      void suggestTags(title);
    }, 700);
    return () => window.clearTimeout(handle);
    // 仅在标题变化且仍允许自动填标签时防抖归纳
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suggestTags 闭包稳定依赖 title
  }, [title]);

  async function submit() {
    if (!file) {
      setError("请先选择视频文件");
      return;
    }
    setBusy(true);
    setError("");
    setStatus(
      cover
        ? "正在上传视频与封面并提取媒体证据…"
        : "正在上传视频；无封面时将自动截取第 1 秒画面…",
    );
    const formData = new FormData();
    formData.append("file", file);
    if (cover) formData.append("cover", cover);
    const resolvedTitle = title.trim() || titleFromFilename(file.name);
    if (resolvedTitle) formData.append("title", resolvedTitle);
    if (goal.trim()) formData.append("goal", goal.trim());
    if (tags.trim()) formData.append("tags", tags.trim());
    try {
      const response = await fetch("/api/draft-reviews", {
        method: "POST",
        body: formData,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "审片失败");
      setStatus("分析完成，正在跳转…");
      router.push(`/review/${body.draft.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "审片失败");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-3xl p-6">
      <div className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#52615a]">
            视频文件 <span className="text-coral">*</span>
          </span>
          <input
            type="file"
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            disabled={busy}
            onChange={(event) => onVideoSelected(event.target.files?.[0] ?? null)}
            className="block w-full rounded-xl border border-line bg-fog px-4 py-3 text-sm"
          />
          <span className="mt-1 block text-xs text-[#7a8680]">
            支持 MP4 / MOV / WebM，单条上传；标题默认取文件名，标签由大模型根据标题归纳（可改）
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#52615a]">
            封面图（选填）
          </span>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/*"
            disabled={busy}
            onChange={(event) => setCover(event.target.files?.[0] ?? null)}
            className="block w-full rounded-xl border border-line bg-fog px-4 py-3 text-sm"
          />
          <span className="mt-1 block text-xs text-[#7a8680]">
            未上传封面时，系统自动截取约第 1 秒画面；上传后仍可在详情页改选其他帧
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#52615a]">标题</span>
          <input
            value={title}
            disabled={busy}
            onChange={(event) => {
              tagsAutoRef.current = true;
              setTitle(event.target.value);
            }}
            placeholder="选择视频后自动填入文件名，可再修改"
            className="block w-full rounded-xl border border-line px-4 py-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#52615a]">
            视频标签
            {suggestingTags && (
              <span className="ml-2 font-normal text-[#7a8680]">正在根据标题归纳…</span>
            )}
          </span>
          <input
            value={tags}
            disabled={busy}
            onChange={(event) => {
              tagsAutoRef.current = false;
              setTagsSource("manual");
              setTags(event.target.value);
            }}
            placeholder="选择视频后由大模型自动归纳，可再修改"
            className="block w-full rounded-xl border border-line px-4 py-3 text-sm"
          />
          <span className="mt-1 block text-xs text-[#7a8680]">
            {tagsSource === "llm"
              ? "已根据标题调用大模型归纳，可直接用于相似视频检索"
              : tagsSource === "heuristic"
                ? "大模型暂不可用，已用标题启发式生成，建议核对后微调"
                : "用于检索历史相似视频的数据与标题，生成刚剪视频的标题建议"}
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#52615a]">
            发布目标 / 简介（选填）
          </span>
          <textarea
            value={goal}
            disabled={busy}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="例如：引流私信咨询 / 讲清软水利益点 / 展示施工现场"
            rows={3}
            className="block w-full rounded-xl border border-line px-4 py-3 text-sm"
          />
        </label>

        {busy && (
          <div className="space-y-2">
            <Progress value={status.includes("完成") ? 100 : 65} />
            <p className="text-sm text-[#66736c]">{status}</p>
          </div>
        )}
        {error && <p className="text-sm font-semibold text-coral">{error}</p>}

        <Button disabled={busy || !file} onClick={() => void submit()} className="w-full sm:w-auto">
          <UploadCloud size={16} />
          开始审片分析
        </Button>
      </div>
    </Card>
  );
}
