"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { applySelectionEdit, EDIT_ACTIONS, type EditAction, type ScriptSelection } from "@/lib/script-workbench/editing";

export function ScriptEditAssist({ scriptId, text, selection, onApply }: {
  scriptId: string;
  text: string;
  selection: ScriptSelection | null;
  onApply: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ target: ScriptSelection; text: string; model: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function generate(action: EditAction) {
    if (!selection) { setError("请先选中全文编辑框里的文字"); return; }
    if (text !== selection.document) { setError("正文已修改，请重新选择文字"); return; }
    setBusy(true);
    setError("");
    setPreview(null);
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({ text, start: selection.start, end: selection.end, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "局部改稿失败");
      if (!request.signal.aborted) setPreview({ target: selection, text: result.suggestion, model: result.model });
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "局部改稿失败");
    } finally {
      if (controller.current === request) setBusy(false);
    }
  }

  function apply() {
    if (!preview) return;
    try {
      onApply(applySelectionEdit(text, preview.target, preview.text));
      setPreview(null);
      setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "无法应用"); }
  }

  return <div className="space-y-3 rounded-xl border border-line bg-[#f7faf8] p-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-semibold text-pine">选中一段，让 AI 帮你改</span>
      {Object.entries(EDIT_ACTIONS).map(([action, label]) => <Button key={action} size="sm" variant="secondary" disabled={busy || !selection} onClick={() => void generate(action as EditAction)}>{label}</Button>)}
      {busy ? <Button size="sm" variant="ghost" onClick={() => { controller.current?.abort(); setBusy(false); }}>取消生成</Button> : null}
    </div>
    <p className="text-xs text-[#66736c]">{busy ? "正在生成改写建议，正文仍可编辑…" : selection ? `已选中 ${selection.text.length} 字；建议确认后才会写入正文。` : "在上方全文编辑框选中文字，单次最多 4000 字。"}</p>
    {error ? <p role="alert" className="text-sm text-coral">{error}</p> : null}
    {preview ? <div className="space-y-3 border-t border-line pt-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div><p className="mb-2 text-xs font-semibold text-[#66736c]">原文</p><p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-7">{preview.target.text}</p></div>
        <div><p className="mb-2 text-xs font-semibold text-pine">改写预览</p><p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-7">{preview.text}</p></div>
      </div>
      {text !== preview.target.document ? <p className="text-sm text-amber-800">正文已修改，本次建议不能直接应用，请重新生成。</p> : null}
      <div className="flex gap-2"><Button size="sm" disabled={text !== preview.target.document} onClick={apply}>应用到选区</Button><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>放弃建议</Button></div>
    </div> : null}
  </div>;
}
