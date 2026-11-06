"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import type { StudioState } from "@/lib/creator-studio/types";
import { DeleteButton, Field, inputClass, readableDate, type StudioActionHandler } from "./common";

export function StylePanel({ state, busy, onAction }: { state: StudioState; busy: boolean; onAction: StudioActionHandler }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAction({ action: "saveSample", title, content }, "样本已加入。点击「学习语气」后用于后续创作。")) { setTitle(""); setContent(""); }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <div className="space-y-5">
        <Card className="p-5 md:p-6">
          <h2 className="font-display text-xl font-semibold">加入你认可的表达</h2>
          <p className="mt-2 text-sm leading-6 text-[#66736c]">放入已确认的成稿，学习句式、节奏与口头禅。样本中的案例和数字不会作为新稿事实。</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <fieldset disabled={busy} className="space-y-4">
            <Field label="样本标题"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} required placeholder="例如：一次真实的净水安装分享" /></Field>
            <Field label="确认稿正文" hint={`${content.length} / 20000 字；至少 100 字，最多保留 30 篇。`}><textarea className={inputClass} rows={7} value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} required placeholder="粘贴你确认过、希望以后延续其表达方式的稿件。" /></Field>
            <Button disabled={busy || !title.trim() || content.replace(/\s/gu, "").length < 100}>加入语气样本</Button>
            </fieldset>
          </form>
        </Card>
        {state.samples.length ? <div className="space-y-3">{state.samples.map((sample) => (
          <Card key={sample.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{sample.title}</h3><p className="mt-1 text-xs text-[#78857e]">{readableDate(sample.createdAt)} · {sample.content.length} 字</p></div><DeleteButton label="这篇样本" disabled={busy} onDelete={() => onAction({ action: "delete", kind: "sample", id: sample.id }, "样本已删除，旧语气档案已清空；可以重新学习。给历史稿件保存的快照不受影响。")} /></div>
            <details className="mt-3 text-sm text-[#52615a]"><summary className="cursor-pointer text-pine">查看正文</summary><p className="mt-3 whitespace-pre-wrap leading-7">{sample.content}</p></details>
          </Card>
        ))}</div> : <EmptyState title="先积累一篇确认稿" description="也可以在脚本详情中，把当前稿加入语气样本。" />}
      </div>
      <Card className="h-fit p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">这个账号的语气</h2><Badge tone={state.styleDigest ? "success" : "neutral"}>{state.styleDigest ? "已学习" : "待学习"}</Badge></div>
        <p className="mt-2 text-sm leading-6 text-[#66736c]">只有你点击学习时才调用模型。新增或删除样本后需要重新学习，避免沿用过期习惯。</p>
        <Button className="mt-4" disabled={busy || state.samples.length === 0} onClick={() => void onAction({ action: "learnStyle" }, "语气档案已更新，后续脚本会使用这份表达习惯。")}>{busy ? "处理中…" : state.styleDigest ? "重新学习语气" : "学习语气"}</Button>
        {state.styleDigest ? <><p className="mt-5 whitespace-pre-wrap rounded-xl bg-fog p-4 text-sm leading-7">{state.styleDigest}</p><p className="mt-3 text-xs text-[#78857e]">更新于 {state.styleUpdatedAt ? readableDate(state.styleUpdatedAt) : "—"}</p></> : <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-sm leading-6 text-[#78857e]">尚无可用档案。先加入你认可的稿件，再学习语气；没有档案时仍使用设置中的账号语气。</p>}
      </Card>
    </div>
  );
}
