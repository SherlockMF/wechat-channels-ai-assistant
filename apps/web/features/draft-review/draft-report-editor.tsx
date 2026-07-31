"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clipboard, Download, FileDown, Save } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { exportMarkdownAsPdf } from "@/lib/reports/export-pdf";

export function DraftReportEditor({ draftReviewId }: { draftReviewId: string }) {
  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const dirty = markdown !== savedMarkdown;

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/draft-reviews/${draftReviewId}/report`)
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
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "报告读取失败"),
      )
      .finally(() => setLoading(false));
  }, [draftReviewId]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function save() {
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const response = await fetch(`/api/draft-reviews/${draftReviewId}/report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存失败");
      setSavedMarkdown(markdown);
      setStatus("已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function copyAll() {
    void navigator.clipboard.writeText(markdown);
    setStatus("已复制到剪贴板");
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `发布前审片-${draftReviewId}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("已开始下载");
  }

  function downloadPdf() {
    try {
      exportMarkdownAsPdf(markdown, `发布前审片-${draftReviewId}`);
      setStatus("已打开 PDF 打印预览，请选择「另存为 PDF」");
      setError("");
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "PDF 导出失败");
    }
  }

  if (loading) return <Card className="min-h-96 animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge tone={dirty ? "warning" : "success"}>
            {dirty ? "未保存修改" : "已同步"}
          </Badge>
          {status && <span className="ml-3 text-sm text-pine">{status}</span>}
          {error && <span className="ml-3 text-sm text-coral">{error}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={copyAll}>
            <Clipboard size={15} />
            复制全文
          </Button>
          <Button variant="secondary" onClick={download}>
            <Download size={15} />
            导出 Markdown
          </Button>
          <Button variant="secondary" onClick={downloadPdf} disabled={!markdown.trim()}>
            <FileDown size={15} />
            导出 PDF
          </Button>
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "保存中…" : <><Save size={15} />保存</>}
          </Button>
          <Link href={`/review/${draftReviewId}`}>
            <Button variant="ghost">
              <Check size={15} />
              返回诊断
            </Button>
          </Link>
        </div>
      </div>
      <Card className="overflow-hidden">
        <textarea
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          className="min-h-[70vh] w-full resize-y border-0 bg-white p-6 font-mono text-sm leading-7 outline-none"
        />
      </Card>
    </div>
  );
}
