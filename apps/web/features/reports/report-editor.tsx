"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clipboard, Download, Save, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";

export function ReportEditor({
  videoId,
  diagnosisHref,
}: {
  videoId: string;
  diagnosisHref: string;
}) {
  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<"adopted" | "inaccurate" | "">("");
  const dirty = markdown !== savedMarkdown;

  useEffect(() => {
    void fetch(`/api/videos/${videoId}/report`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`报告读取失败（${response.status}）`);
        return response.json();
      })
      .then((body) => {
        const next = body.markdown ?? "";
        setMarkdown(next);
        setSavedMarkdown(next);
        setError("");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "报告读取失败"));
    const storedFeedback = window.localStorage.getItem(`video-feedback:${videoId}`);
    if (storedFeedback === "adopted" || storedFeedback === "inaccurate") {
      setFeedback(storedFeedback);
    }
  }, [videoId]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    function guardNavigation(event: MouseEvent) {
      if (!dirty) return;
      const target = event.target as Element | null;
      const link = target?.closest("a[href]");
      if (link && !window.confirm("报告还有未保存修改，确定离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [dirty]);

  async function save() {
    setStatus("保存中…");
    try {
      const response = await fetch(`/api/videos/${videoId}/report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      if (!response.ok) throw new Error(`报告保存失败（${response.status}）`);
      setSavedMarkdown(markdown);
      setStatus("已保存");
      setError("");
    } catch (saveError) {
      setStatus("保存失败");
      setError(saveError instanceof Error ? saveError.message : "报告保存失败");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("已复制完整报告");
      setError("");
    } catch {
      setError("无法访问剪贴板，请手动复制报告内容。");
    }
  }

  function recordFeedback(value: "adopted" | "inaccurate") {
    setFeedback(value);
    window.localStorage.setItem(`video-feedback:${videoId}`, value);
    setStatus(value === "adopted" ? "已记录：已采用" : "已记录：不准确");
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `视频诊断-${videoId}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Markdown 已导出");
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden">
        {error && (
          <div className="border-b border-[#edc2bc] bg-[#fff0ee] px-5 py-3 text-sm font-semibold text-[#a53f33]">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-3 border-b border-line bg-[#fafbfa] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Badge tone="info">可编辑草稿</Badge>
            {(status || dirty) && (
              <span className="flex items-center gap-1 text-xs font-semibold text-pine">
                <Check size={13} />
                {dirty ? "有未保存修改" : status}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={copy}>
              <Clipboard size={13} />
              复制全文
            </Button>
            <Button size="sm" variant="secondary" onClick={download}>
              <Download size={13} />
              导出 Markdown
            </Button>
            <Button size="sm" onClick={save}>
              <Save size={13} />
              保存
            </Button>
          </div>
        </div>
        <textarea
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          spellCheck={false}
          className="min-h-[720px] w-full resize-y border-0 bg-white p-7 font-mono text-[13px] leading-6 outline-none"
          aria-label="Markdown 报告编辑器"
        />
      </Card>
      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">交付前检查</h3>
          <ul className="mt-3 space-y-3 text-sm leading-5 text-[#647169]">
            <li>· 每个问题是否包含具体时间段</li>
            <li>· 引用原片是否注明素材位置</li>
            <li>· 无素材时是否标记需要补拍</li>
            <li>· 是否避免虚构逐秒留存</li>
            <li>· CTA 是否只有一个明确动作</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">建议反馈</h3>
          <p className="mt-2 text-xs leading-5 text-[#748179]">
            反馈保存在当前浏览器，便于本地复盘和后续校准。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant={feedback === "adopted" ? "primary" : "secondary"}
              onClick={() => recordFeedback("adopted")}
            >
              <ThumbsUp size={14} />
              已采用
            </Button>
            <Button
              variant={feedback === "inaccurate" ? "danger" : "secondary"}
              onClick={() => recordFeedback("inaccurate")}
            >
              <ThumbsDown size={14} />
              不准确
            </Button>
          </div>
        </Card>
        <Link
          href={diagnosisHref}
          className="block rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-pine hover:bg-fog"
        >
          返回视频诊断
        </Link>
      </div>
    </div>
  );
}
