"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import type { CreatorTopic } from "@/lib/creator-studio/types";
import { DeleteButton, Field, inputClass, type StudioActionHandler } from "./common";

type TopicForm = Pick<CreatorTopic, "subject" | "note" | "source" | "planDate" | "status" | "draftId">;
const empty: TopicForm = { subject: "", note: "", source: "手动", planDate: "", status: "idea", draftId: null };
const statuses = { idea: "待写", planned: "已排期", done: "已成稿" } as const;
function localToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }

export function TopicPanel({ items, busy, onAction }: { items: CreatorTopic[]; busy: boolean; onAction: StudioActionHandler }) {
  const [id, setId] = useState<string>();
  const [form, setForm] = useState<TopicForm>(empty);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const today = localToday();
  const visible = items.filter((topic) => (filter === "all" || topic.status === filter) && `${topic.subject} ${topic.note}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || (a.planDate || "9999").localeCompare(b.planDate || "9999") || b.createdAt.localeCompare(a.createdAt));
  function reset() { setId(undefined); setForm(empty); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await onAction({ action: "saveTopic", id, ...form }, id ? "选题已更新。" : "选题已放入池中，准备好时再开始写。")) reset(); }
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.3fr)]">
    <Card className="p-5 md:p-6"><h2 className="font-display text-xl font-semibold">{id ? "编辑选题" : "先记下来，合适时再写"}</h2><p className="mt-2 text-sm leading-6 text-[#66736c]">热点、灵感和待办选题集中放在这里。排期是创作提醒，不会自动生成或发布。</p><form onSubmit={submit} className="mt-5 space-y-4">
      <fieldset disabled={busy} className="space-y-4">
      <Field label="选题"><input className={inputClass} required maxLength={180} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="例如：净水器装好后，为什么水压变小了" /></Field>
      <Field label="备注与参考来源"><textarea className={inputClass} rows={5} maxLength={3000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="记下角度、待准备的素材或原文链接。" /></Field>
      <Field label="计划创作日期" hint="留空则只收藏，不安排日期。"><input className={inputClass} type="date" value={form.planDate} onChange={(e) => setForm({ ...form, planDate: e.target.value, status: form.status === "done" ? "done" : e.target.value ? "planned" : "idea" })} /></Field>
      <Field label="状态"><select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CreatorTopic["status"] })}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <div className="flex gap-2"><Button disabled={busy}>{id ? "保存修改" : "加入选题池"}</Button>{id ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>取消编辑</Button> : null}</div>
      </fieldset>
    </form></Card>
    <div className="space-y-4"><div className="flex flex-wrap gap-3"><input className={`${inputClass} min-w-[180px] flex-1`} type="search" aria-label="搜索选题" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索选题与备注" /><select className={`${inputClass} !w-auto`} aria-label="按选题状态筛选" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">全部状态</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {visible.length ? visible.map((topic) => { const overdue = topic.status !== "done" && topic.planDate && topic.planDate < today; return <Card key={topic.id} className={`p-5 ${overdue ? "border-[#ead1a9]" : ""}`}><div className="flex flex-wrap items-center gap-2"><Badge tone={topic.status === "done" ? "success" : overdue ? "warning" : "neutral"}>{statuses[topic.status]}</Badge><span className="text-xs text-[#78857e]">{topic.source || "手动"}{topic.planDate ? ` · ${topic.planDate}${overdue ? " 已过排期" : ""}` : " · 未排期"}</span></div><h3 className="mt-3 text-lg font-semibold">{topic.subject}</h3>{topic.note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#52615a]">{topic.note}</p> : null}<div className="mt-4 flex flex-wrap items-center gap-2"><Link className="inline-flex h-8 items-center rounded-lg bg-pine px-3 text-xs font-semibold text-white hover:bg-[#174e3d]" href={`/scripts/new?creatorTopicId=${encodeURIComponent(topic.id)}`}>写这条</Link>{topic.draftId ? <Link className="px-2 text-xs font-semibold text-pine hover:underline" href={`/scripts/${topic.draftId}`}>查看关联稿件</Link> : null}<Button variant="ghost" size="sm" disabled={busy} onClick={() => { setId(topic.id); setForm({ subject: topic.subject, note: topic.note, source: topic.source, planDate: topic.planDate, status: topic.status, draftId: topic.draftId }); }}>编辑</Button><DeleteButton label="这条选题" disabled={busy} onDelete={async () => { const ok = await onAction({ action: "delete", kind: "topic", id: topic.id }, "选题已删除，关联稿件保留。"); if (ok && id === topic.id) reset(); return ok; }} /></div></Card>; }) : <EmptyState title={query || filter !== "all" ? "没有符合条件的选题" : "给下一条视频留一个位置"} description="从热点卡收藏，或直接在左侧记下想法。" />}
    </div>
  </div>;
}
