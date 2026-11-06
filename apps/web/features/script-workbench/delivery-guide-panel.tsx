"use client";
import type { ScriptDeliveryGuide } from "@video-diagnosis/shared-types";
import { Button, Card } from "@/components/ui";
import { SpokenCueText } from "./spoken-cue-text";

const emotions = { neutral: "中性", warm: "温和", confident: "坚定", serious: "严肃", surprised: "惊讶", questioning: "提问", reassuring: "安抚" };
const paces = { slow: "放慢", normal: "正常", fast: "加快" };
const pauses = { none: "不停", micro: "微停", short: "短停", medium: "中停", long: "长停" };

function GuideBody({ guide }: { guide: ScriptDeliveryGuide }) {
  return <div className="space-y-4">
    <dl className="grid gap-x-5 gap-y-2 text-sm leading-7 sm:grid-cols-[5rem_1fr]">
      <dt className="text-[#66736c]">整体基调</dt><dd>{guide.overallTone}</dd>
      <dt className="text-[#66736c]">语速节奏</dt><dd>{guide.paceHint || paces[guide.overallPace]}</dd>
      {guide.cameraNote ? <><dt className="text-[#66736c]">出镜提醒</dt><dd>{guide.cameraNote}</dd></> : null}
    </dl>
    {guide.blocks.flatMap((block, blockIndex) => block.segments.map((segment, index) => <section key={`${blockIndex}-${index}`} className="space-y-3 rounded-xl border border-line bg-white p-5">
      <p className="whitespace-pre-wrap text-lg leading-9"><SpokenCueText text={segment.text} emphasis={segment.emphasis} /></p>
      <div className="flex flex-wrap gap-2 text-sm leading-6">
        <span className="rounded-lg bg-[#edf5f0] px-3 py-1 text-pine"><b>语气 </b>{segment.toneHint || `${emotions[segment.emotion]} ${segment.intensity}/3 · ${paces[segment.pace]}`}</span>
        {segment.emphasis.length ? <span className="rounded-lg border border-line px-3 py-1"><b>重读 </b>{segment.emphasis.join("、")}</span> : null}
        {segment.pauseHint || segment.pauseAfter !== "none" ? <span className="rounded-lg border border-dashed border-line px-3 py-1"><b>停顿 </b>{segment.pauseHint || pauses[segment.pauseAfter]}</span> : null}
        {segment.expression ? <span className="rounded-lg border border-line px-3 py-1"><b>表情 </b>{segment.expression}</span> : null}
        {segment.action ? <span className="rounded-lg border border-line px-3 py-1"><b>动作 </b>{segment.action}</span> : null}
        {segment.breathBefore ? <span className="rounded-lg border border-line px-3 py-1">句前换气</span> : null}
      </div>
      {segment.spokenAs.trim() !== segment.text.trim() ? <p className="text-sm text-[#66736c]">实际念法：{segment.spokenAs}</p> : null}
      {segment.pronunciation.filter(item => item.needsReview).map((item, i) => <p key={i} className="text-xs text-amber-800">读音待确认：{item.text} → {item.spokenAs}</p>)}
    </section>))}
    {guide.rehearsalNotes.length ? <ul className="list-disc pl-5 text-sm text-[#66736c]">{guide.rehearsalNotes.map((note, i) => <li key={i}>{note}</li>)}</ul> : null}
    {guide.warnings.length ? <ul className="list-disc pl-5 text-xs text-amber-900">{guide.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
  </div>;
}

export function DeliveryGuidePanel({ guide, busy, error, canGenerate, readOnly, onGenerate, onCancel, onCopy, onPrompter }: {
  guide: ScriptDeliveryGuide | null; busy: boolean; error: string; canGenerate: boolean; readOnly: boolean;
  onGenerate: (mode: "ai" | "basic") => void; onCancel: () => void; onCopy: () => void; onPrompter: () => void;
}) {
  return <Card className="space-y-5 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="delivery-guide" className="scroll-mt-24 font-semibold">口播语气／演讲提示</h3>
        <p className="mt-1 text-xs text-[#66736c]">{guide?.source === "ai" ? `AI 演绎指导 · ${guide.model || "已保存"}` : guide?.source === "rules" ? "当前只有基础规则提示，尚未生成 AI 演绎指导" : guide ? "历史演讲提示" : "按当前口播生成具体的语气、重读、停顿、表情与动作"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!canGenerate} onClick={onPrompter}>提词器</Button>
        <Button size="sm" variant="secondary" disabled={!guide} onClick={onCopy}>复制口播提示</Button>
        {!readOnly ? <Button size="sm" disabled={busy || !canGenerate} onClick={() => onGenerate("ai")}>{busy ? "正在生成 AI 提示…" : guide?.source === "ai" ? "重新生成 AI 口播提示" : "生成 AI 口播提示"}</Button> : null}
        {busy ? <Button size="sm" variant="ghost" onClick={onCancel}>取消生成</Button> : null}
      </div>
    </div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-coral">{error} {guide ? "原有提示已保留，未替换成规则结果。" : "本次未生成提示。"}</p> : null}
    {!guide ? <p className="text-sm text-[#66736c]">{canGenerate ? "正文尚无匹配提示，或改稿后旧提示已失效。保存当前稿件后可重新生成。" : "先填写口播正文，再生成演绎提示。"}</p> : null}
    {guide?.source === "rules" ? <details className="rounded-xl border border-line p-4"><summary className="cursor-pointer text-sm text-[#66736c]">展开基础规则提示（非 AI）</summary><div className="mt-4"><GuideBody guide={guide} /></div></details> : guide ? <GuideBody guide={guide} /> : null}
    {!readOnly ? <p className="text-xs text-[#66736c]">AI 提示会理解文意并单独保存，不改写正文。模型不可用时，可<button type="button" className="ml-1 underline" disabled={busy || !canGenerate} onClick={() => onGenerate("basic")}>使用基础规则提示</button>。</p> : null}
  </Card>;
}
