"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import type { CreatorSection } from "@/lib/creator-studio/types";
import { DeleteButton, Field, inputClass, type StudioActionHandler } from "./common";

type SectionForm = Pick<CreatorSection, "name" | "purpose" | "guide" | "fields">;
const empty: SectionForm = { name: "", purpose: "", guide: "", fields: [] };
export function SectionPanel({ items, busy, onAction }: { items: CreatorSection[]; busy: boolean; onAction: StudioActionHandler }) {
  const [id, setId] = useState<string>();
  const [form, setForm] = useState<SectionForm>(empty);
  function reset() { setId(undefined); setForm(empty); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await onAction({ action: "saveSection", id, ...form }, "栏目已保存，新建脚本时可以选择并填写栏目素材。")) reset(); }
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
    <Card className="p-5 md:p-6"><h2 className="font-display text-xl font-semibold">{id ? "编辑栏目" : "让每个栏目有自己的写法"}</h2><p className="mt-2 text-sm leading-6 text-[#66736c]">例如施工案例需要“现场问题、处理过程、结果”。把这些设为栏目素材，新建脚本时逐项填写。</p><form onSubmit={submit} className="mt-5 space-y-4">
      <fieldset disabled={busy} className="space-y-4">
      <Field label="栏目名称"><input className={inputClass} required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：一次施工复盘" /></Field>
      <Field label="栏目用途"><input className={inputClass} maxLength={500} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="这个栏目为观众解决什么问题" /></Field>
      <Field label="写作规则"><textarea className={inputClass} rows={4} maxLength={3000} value={form.guide} onChange={(e) => setForm({ ...form, guide: e.target.value })} placeholder="例如先展示现场问题，再解释选择，最后说出真实结果。" /></Field>
      <fieldset className="space-y-3 rounded-xl border border-line bg-fog/50 p-4"><legend className="px-1 text-sm font-semibold">每篇需要哪些素材</legend>
        {form.fields.map((field, index) => <div key={field.id} className="flex flex-wrap items-center gap-2"><input className={`${inputClass} min-w-[160px] flex-1`} aria-label={`素材字段 ${index + 1}`} required maxLength={80} value={field.label} onChange={(e) => setForm({ ...form, fields: form.fields.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item) })} placeholder="例如：现场问题" /><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={field.required} onChange={(e) => setForm({ ...form, fields: form.fields.map((item) => item.id === field.id ? { ...item, required: e.target.checked } : item) })} />必填</label><Button type="button" variant="ghost" size="sm" aria-label={`移除字段 ${field.label || index + 1}`} onClick={() => setForm({ ...form, fields: form.fields.filter((item) => item.id !== field.id) })}>移除</Button></div>)}
        <Button type="button" variant="secondary" size="sm" disabled={form.fields.length >= 12} onClick={() => setForm({ ...form, fields: [...form.fields, { id: `field_${crypto.randomUUID().replace(/-/gu, "").slice(0, 12)}`, label: "", required: false }] })}>添加素材字段</Button>
      </fieldset>
      <div className="flex gap-2"><Button disabled={busy}>{id ? "保存修改" : "保存栏目"}</Button>{id ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>取消编辑</Button> : null}</div>
      </fieldset>
    </form></Card>
    <div className="space-y-4">{items.length ? items.map((item) => <Card key={item.id} className="p-5"><h3 className="font-display text-xl font-semibold">{item.name}</h3><p className="mt-2 text-sm text-[#66736c]">{item.purpose || "尚未填写栏目用途"}</p>{item.guide ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{item.guide}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{item.fields.map((field) => <Badge key={field.id} tone={field.required ? "warning" : "neutral"}>{field.label}{field.required ? " · 必填" : ""}</Badge>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={busy} onClick={() => { setId(item.id); setForm({ name: item.name, purpose: item.purpose, guide: item.guide, fields: item.fields.map((field) => ({ ...field })) }); }}>编辑</Button><DeleteButton label="这个栏目" disabled={busy} onDelete={async () => { const ok = await onAction({ action: "delete", kind: "section", id: item.id }, "栏目已删除；历史脚本的栏目快照不会改变。"); if (ok && id === item.id) reset(); return ok; }} /></div></Card>) : <EmptyState title="建立第一个栏目" description="保留固定结构，把精力留给每次不同的真实故事。" />}</div>
  </div>;
}
