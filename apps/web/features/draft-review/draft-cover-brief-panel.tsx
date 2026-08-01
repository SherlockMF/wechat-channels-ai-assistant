"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ImagePlus, Loader2, Trash2 } from "lucide-react";
import type { DraftCoverBrief } from "@video-diagnosis/shared-types";
import { SelectWithOther } from "@/components/select-with-other";
import { Badge, Button, cn } from "@/components/ui";
import {
  coverBriefAspectChoices,
  coverBriefMoodChoices,
  coverBriefOverlayChoices,
  coverBriefStyleChoices,
  coverBriefThemeChoices,
} from "@/lib/draft-review/cover-brief-options";

type BriefItem = DraftCoverBrief & { backgroundUrl?: string | null };

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function applyBriefToForm(
  brief: BriefItem,
  setters: {
    setDescription: (value: string) => void;
    setStyle: (value: string) => void;
    setThemeColor: (value: string) => void;
    setAspectRatio: (value: string) => void;
    setMood: (value: string) => void;
    setOverlay: (value: string) => void;
    setReuseBriefId: (value: string | null) => void;
    setFile: (value: File | null) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
  },
) {
  setters.setDescription(brief.userDescription ?? "");
  setters.setStyle(brief.options?.style ?? "");
  setters.setThemeColor(brief.options?.themeColor ?? "");
  setters.setAspectRatio(brief.options?.aspectRatio ?? "");
  setters.setMood(brief.options?.mood ?? "");
  setters.setOverlay(brief.options?.overlay ?? "");
  setters.setReuseBriefId(brief.id);
  setters.setFile(null);
  if (setters.fileInputRef.current) {
    setters.fileInputRef.current.value = "";
  }
}

export function DraftCoverBriefPanel({
  draftReviewId,
  versionId,
  compact = false,
}: {
  draftReviewId: string;
  versionId: string | null;
  /** 嵌在左侧视频卡内时去掉外层卡片样式 */
  compact?: boolean;
}) {
  const [items, setItems] = useState<BriefItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  /** 刷新后复用历史方案的背景图 */
  const [reuseBriefId, setReuseBriefId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("");
  const [themeColor, setThemeColor] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const [mood, setMood] = useState("");
  const [overlay, setOverlay] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const formSetters = {
    setDescription,
    setStyle,
    setThemeColor,
    setAspectRatio,
    setMood,
    setOverlay,
    setReuseBriefId,
    setFile,
    fileInputRef,
  };

  async function load(options?: { hydrateForm?: boolean }) {
    const response = await fetch(
      `/api/draft-reviews/${draftReviewId}/cover-briefs`,
    );
    if (!response.ok) throw new Error("读取封面方案失败");
    const body = await response.json();
    const next = (body.items ?? []) as BriefItem[];
    setItems(next);
    const pick =
      (selectedId && next.find((item) => item.id === selectedId)) ||
      next[0] ||
      null;
    setSelectedId(pick?.id ?? null);
    if (options?.hydrateForm && pick) {
      applyBriefToForm(pick, formSetters);
    }
    return next;
  }

  useEffect(() => {
    void load({ hydrateForm: !hydrated })
      .then(() => setHydrated(true))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "读取失败"),
      );
    // 仅随审片切换重新拉取；表单只在首次 hydrate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReviewId]);

  useEffect(() => {
    if (!file) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const reuseBrief = reuseBriefId
    ? items.find((item) => item.id === reuseBriefId) ?? null
    : null;
  const backgroundPreviewUrl =
    localPreviewUrl ?? reuseBrief?.backgroundUrl ?? null;

  function selectHistory(brief: BriefItem) {
    setSelectedId(brief.id);
    applyBriefToForm(brief, formSetters);
    setMessage("已载入该历史方案的背景图与描述，可直接改后重新生成");
  }

  async function deleteHistory(brief: BriefItem) {
    if (!window.confirm("删除该封面方案历史？")) return;
    setDeletingId(brief.id);
    setError("");
    try {
      const response = await fetch(
        `/api/draft-reviews/${draftReviewId}/cover-briefs/${brief.id}`,
        { method: "DELETE" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "删除失败");
      const next = await load({ hydrateForm: false });
      if (reuseBriefId === brief.id) {
        const fallback = next[0] ?? null;
        if (fallback) applyBriefToForm(fallback, formSetters);
        else {
          setReuseBriefId(null);
          setDescription("");
          setStyle("");
          setThemeColor("");
          setAspectRatio("");
          setMood("");
          setOverlay("");
        }
      }
      setMessage("已删除封面方案");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setDeletingId("");
    }
  }

  async function generate() {
    if (!file && !reuseBriefId) {
      setError("请先上传背景图");
      return;
    }
    if (!description.trim()) {
      setError("请填写想要的描述");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      if (file) {
        form.set("background", file);
      } else if (reuseBriefId) {
        form.set("reuseBackgroundFromBriefId", reuseBriefId);
      }
      form.set("description", description.trim());
      if (versionId) form.set("versionId", versionId);
      if (style) form.set("style", style);
      if (themeColor) form.set("themeColor", themeColor);
      if (aspectRatio) form.set("aspectRatio", aspectRatio);
      if (mood) form.set("mood", mood);
      if (overlay) form.set("overlay", overlay);
      const response = await fetch(
        `/api/draft-reviews/${draftReviewId}/cover-briefs`,
        { method: "POST", body: form },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "生成失败");
      const brief = body.brief as BriefItem;
      setSelectedId(brief.id);
      setReuseBriefId(brief.id);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("已生成：复制下方整段提示词，连同同一张图发给 GPT");
      await load();
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "生成失败",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-4", !compact && "rounded-2xl border border-line bg-white p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={cn("font-display font-semibold", compact ? "text-lg" : "text-xl")}>
            生成封面方案
          </h2>
          <p className="mt-1 text-sm text-[#66736c]">
            {compact
              ? "上传实景图 + 描述，生成可粘贴给 GPT 的提示词。"
              : "上传实景图 + 描述（必填）；风格/主题色等为可选。得到一整段提示词，复制后连同同一张图发给 GPT。"}
          </p>
        </div>
        <Button disabled={busy} onClick={() => void generate()}>
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ImagePlus size={14} />
          )}
          {busy ? "生成中…" : "生成"}
        </Button>
      </div>

      <div
        className={cn(
          "grid gap-4",
          compact ? "grid-cols-1" : "md:grid-cols-[180px_1fr]",
        )}
      >
        <div className="space-y-2">
          <p className="text-sm font-bold text-[#52615a]">背景图</p>
          {backgroundPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backgroundPreviewUrl}
              alt="背景预览"
              className={cn(
                "w-full rounded-xl border border-line object-cover",
                compact ? "h-36" : "h-28",
              )}
            />
          ) : (
            <div
              className={cn(
                "flex items-center justify-center rounded-xl border border-dashed border-line bg-fog/50 text-xs text-[#9aa59e]",
                compact ? "h-36" : "h-28",
              )}
            >
              尚未选择
            </div>
          )}
          <label className="block text-xs font-normal text-[#66736c]">
            {file
              ? "已选新文件"
              : reuseBriefId
                ? "沿用历史背景（可重新选择）"
                : "选择文件"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="mt-1 block w-full text-sm font-normal"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                if (next) setReuseBriefId(null);
              }}
            />
          </label>
        </div>
        <label className="block text-sm font-bold text-[#52615a]">
          想要的描述
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={compact ? 3 : 5}
            maxLength={1000}
            placeholder="例如：江南映像这套房我们做了精工水电，要突出全屋智能和全屋净水，专业可信"
            className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm font-normal"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectWithOther
          label="风格"
          optionalHint
          value={style}
          onChange={setStyle}
          options={coverBriefStyleChoices}
          allowEmpty
          emptyLabel="不指定"
          otherPlaceholder="自定义风格"
          selectClassName="rounded-xl py-2.5 font-normal"
          className="text-sm font-bold text-[#52615a] [&>span]:text-sm [&>span]:font-bold"
        />
        <SelectWithOther
          label="主题色"
          optionalHint
          value={themeColor}
          onChange={setThemeColor}
          options={coverBriefThemeChoices}
          allowEmpty
          emptyLabel="不指定"
          otherPlaceholder="例如：墨绿、香槟金…"
          selectClassName="rounded-xl py-2.5 font-normal"
          className="text-sm font-bold text-[#52615a] [&>span]:text-sm [&>span]:font-bold"
        />
        <SelectWithOther
          label="画幅"
          optionalHint
          value={aspectRatio}
          onChange={setAspectRatio}
          options={coverBriefAspectChoices}
          allowEmpty
          emptyLabel="不指定"
          otherPlaceholder="例如：1:1、21:9…"
          selectClassName="rounded-xl py-2.5 font-normal"
          className="text-sm font-bold text-[#52615a] [&>span]:text-sm [&>span]:font-bold"
        />
        <SelectWithOther
          label="调性"
          optionalHint
          value={mood}
          onChange={setMood}
          options={coverBriefMoodChoices}
          allowEmpty
          emptyLabel="不指定"
          otherPlaceholder="自定义调性"
          selectClassName="rounded-xl py-2.5 font-normal"
          className="text-sm font-bold text-[#52615a] [&>span]:text-sm [&>span]:font-bold"
        />
        <SelectWithOther
          label="压暗"
          optionalHint
          value={overlay}
          onChange={setOverlay}
          options={coverBriefOverlayChoices}
          allowEmpty
          emptyLabel="不指定"
          otherPlaceholder="自定义压暗程度"
          selectClassName="rounded-xl py-2.5 font-normal"
          className="text-sm font-bold text-[#52615a] [&>span]:text-sm [&>span]:font-bold"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-[#edc2bc] bg-[#fff3f1] px-4 py-3 text-sm text-[#9f4035]">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-pine">{message}</p>}

      {selected && (
        <div className="space-y-3 rounded-xl border border-line bg-fog/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                selected.status === "completed"
                  ? "success"
                  : selected.status === "failed"
                    ? "danger"
                    : "info"
              }
            >
              {selected.status}
            </Badge>
            <span className="text-xs text-[#7a8680]">
              {new Date(selected.createdAt).toLocaleString("zh-CN")}
            </span>
            {selected.backgroundUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.backgroundUrl}
                alt="背景"
                className="ml-auto h-12 w-16 rounded object-cover"
              />
            )}
          </div>
          {selected.status === "failed" && (
            <p className="text-sm text-coral">
              {selected.errorMessage ?? "生成失败"}
            </p>
          )}
          {selected.status === "completed" && selected.imagePrompt && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-bold">
                  发给 GPT 的完整提示词（配同一张图）
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void copyText(selected.imagePrompt ?? "").then(() =>
                      setMessage("已复制整段提示词"),
                    )
                  }
                >
                  <Copy size={13} />
                  复制
                </Button>
              </div>
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-white p-3 text-sm leading-6 text-[#3f4b45]">
                {selected.imagePrompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-[#52615a]">历史版本</p>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-stretch overflow-hidden rounded-lg border text-sm transition ${
                  item.id === selected?.id
                    ? "border-pine bg-[#e9f0eb]"
                    : "border-line bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectHistory(item)}
                  className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-black/[0.02]"
                >
                  {new Date(item.createdAt).toLocaleString("zh-CN")} · {item.status}
                  {item.titles?.[0] ? ` · ${item.titles[0]}` : ""}
                </button>
                <button
                  type="button"
                  title="删除"
                  disabled={deletingId === item.id}
                  onClick={() => void deleteHistory(item)}
                  className="border-l border-line px-2.5 text-[#7a8680] hover:bg-[#fdeceb] hover:text-coral disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
