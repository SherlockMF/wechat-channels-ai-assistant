"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { materialKinds, type CreatorMaterial } from "@/lib/creator-studio/types";
import { DeleteButton, Field, inputClass, type StudioActionHandler } from "./common";

const empty = { title: "", kind: "案例" as CreatorMaterial["kind"], body: "", tags: "" };
export function MaterialPanel({ items, busy, onAction }: { items: CreatorMaterial[]; busy: boolean; onAction: StudioActionHandler }) {
  const [id, setId] = useState<string>();
  const [form, setForm] = useState(empty);
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${item.title} ${item.body} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function reset() { setId(undefined); setForm(empty); }
  function edit(item: CreatorMaterial) { setId(item.id); setForm({ title: item.title, kind: item.kind, body: item.body, tags: item.tags.join("、") }); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const tags = form.tags.split(/[,，、;；\n]/u).map((tag) => tag.trim()).filter(Boolean);
    if (await onAction({ action: "saveMaterial", id, ...form, tags }, id ? "素材已更新。" : "真实素材已保存，生成相关主题时会自动选用。")) reset();
  }
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.3fr)]">
    <Card className="p-5 md:p-6"><h2 className="font-display text-xl font-semibold">{id ? "编辑素材" : "留住真实细节"}</h2><p className="mt-2 text-sm leading-6 text-[#66736c]">把现场经历、可核验数据和客户案例积累下来。写相关主题时自动选用，资料缺失时不会补编。</p><form onSubmit={submit} className="mt-5 space-y-4">
      <fieldset disabled={busy} className="space-y-4">
      <Field label="标题"><input className={inputClass} required maxLength={180} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="类型"><select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CreatorMaterial["kind"] })}>{materialKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></Field>
      <Field label="事实与细节" hint="只写真实信息；可在正文注明来源、日期和需要保密的范围。"><textarea className={inputClass} required rows={8} maxLength={10000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      <Field label="标签" hint="用顿号或逗号分隔，例如：净水、安装、客户案例。"><input className={inputClass} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
      <div className="flex gap-2"><Button disabled={busy}>{id ? "保存修改" : "保存素材"}</Button>{id ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>取消编辑</Button> : null}</div>
      </fieldset>
    </form></Card>
    <div className="space-y-4"><Field label={`素材库 · ${items.length} 条`}><input className={inputClass} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题、标签或正文" /></Field>
      {filtered.length ? filtered.map((item) => <Card key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Badge>{item.kind}</Badge><h3 className="mt-2 font-semibold">{item.title}</h3></div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={busy} onClick={() => edit(item)}>编辑</Button><DeleteButton label="这条素材" disabled={busy} onDelete={async () => { const ok = await onAction({ action: "delete", kind: "material", id: item.id }, "素材已删除；历史稿件中的资料快照保留。"); if (ok && id === item.id) reset(); return ok; }} /></div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#52615a]">{item.body}</p>{item.tags.length ? <div className="mt-3 flex flex-wrap gap-2">{item.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div> : null}</Card>) : <EmptyState title={query ? "没有匹配的素材" : "素材库还没有记录"} description={query ? "试试更短的关键词。" : "从一个真实案例开始，下一次写稿可以直接复用。"} />}
    </div>
  </div>;
}
