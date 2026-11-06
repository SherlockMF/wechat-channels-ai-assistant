"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CalendarDays, Layers3, Mic2 } from "lucide-react";
import { Button, Card, cn } from "@/components/ui";
import type { StudioState } from "@/lib/creator-studio/types";
import { StylePanel } from "./style-panel";
import { MaterialPanel } from "./material-panel";
import { SectionPanel } from "./section-panel";
import { TopicPanel } from "./topic-panel";

const tabs = [
  { key: "topics", title: "选题池", hint: "收集与排期", icon: CalendarDays },
  { key: "materials", title: "真实素材", hint: "案例与事实", icon: BookOpen },
  { key: "sections", title: "内容栏目", hint: "结构与必填素材", icon: Layers3 },
  { key: "samples", title: "语气样本", hint: "学会你的表达", icon: Mic2 },
] as const;
type Tab = typeof tabs[number]["key"];

export function CreatorWorkspace() {
  const [state, setState] = useState<StudioState | null>(null);
  const [tab, setTab] = useState<Tab>("topics");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const actionPending = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/creator-studio", { signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创作资料读取失败");
      setState(data.state);
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "创作资料读取失败"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const chosen = new URLSearchParams(window.location.search).get("tab");
    if (tabs.some((item) => item.key === chosen)) setTab(chosen as Tab);
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function onAction(input: Record<string, unknown>, success: string): Promise<boolean> {
    if (actionPending.current) return false;
    actionPending.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/creator-studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      setState(data.state); setMessage(success);
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "操作失败"); return false; }
    finally { actionPending.current = false; setBusy(false); }
  }
  if (loading) return <Card className="p-8 text-sm text-[#66736c]">正在读取创作资料…</Card>;
  if (!state) return <Card className="space-y-3 p-8"><p role="alert" className="text-sm text-coral">{error || "创作资料读取失败"}</p><Button variant="secondary" onClick={() => void load()}>重新读取</Button></Card>;
  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="tablist" aria-label="创作资料类型">{tabs.map((item) => { const Icon = item.icon; return <button key={item.key} role="tab" id={`tab-${item.key}`} aria-controls={`panel-${item.key}`} aria-selected={tab === item.key} onClick={() => { setTab(item.key); setMessage(""); }} className={cn("flex items-center gap-3 rounded-xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/30", tab === item.key ? "border-pine bg-[#e9f0eb] text-pine" : "border-line bg-white text-[#66736c] hover:border-[#b8c6bd]")}><Icon size={20} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-[11px]">{item.hint}</span></span><span className="font-display text-xl font-semibold">{state[item.key].length}</span></button>; })}</div>
    {error ? <div role="alert" className="rounded-xl border border-[#edc2bc] bg-[#fff0ee] px-4 py-3 text-sm text-coral">{error}</div> : null}
    {message ? <div role="status" className="rounded-xl border border-[#b8d7c9] bg-[#eaf5ef] px-4 py-3 text-sm text-pine">{message}</div> : null}
    {busy ? <p role="status" className="text-sm text-[#66736c]">正在处理，请稍候…</p> : null}
    <div role="tabpanel" id="panel-samples" aria-labelledby="tab-samples" hidden={tab !== "samples"}><StylePanel state={state} busy={busy} onAction={onAction} /></div>
    <div role="tabpanel" id="panel-materials" aria-labelledby="tab-materials" hidden={tab !== "materials"}><MaterialPanel items={state.materials} busy={busy} onAction={onAction} /></div>
    <div role="tabpanel" id="panel-sections" aria-labelledby="tab-sections" hidden={tab !== "sections"}><SectionPanel items={state.sections} busy={busy} onAction={onAction} /></div>
    <div role="tabpanel" id="panel-topics" aria-labelledby="tab-topics" hidden={tab !== "topics"}><TopicPanel items={state.topics} busy={busy} onAction={onAction} /></div>
  </div>;
}
