"use client";

import { useEffect, useRef, useState } from "react";
import type { ScriptDeliveryGuide } from "@video-diagnosis/shared-types";
import { Button } from "@/components/ui";

import { SpokenCueText } from "@/features/script-workbench/spoken-cue-text";

const PREFS_KEY = "script-prompter-v1";
const emotionLabel = { neutral: "中性", warm: "温和", confident: "坚定", serious: "严肃", surprised: "惊讶", questioning: "提问", reassuring: "安抚" };
const paceLabel = { slow: "放慢", normal: "正常", fast: "加快" };
const pauseLabel = { none: "不停", micro: "微停", short: "短停", medium: "中停", long: "长停" };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function ScriptTeleprompter({ text, guide, onClose }: {
  text: string;
  guide?: ScriptDeliveryGuide;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(35);
  const [size, setSize] = useState(48);
  const [mirror, setMirror] = useState(false);
  const [hints, setHints] = useState(true);
  const [progress, setProgress] = useState(0);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
      if (saved) {
        if (typeof saved.speed === "number" && Number.isFinite(saved.speed)) setSpeed(clamp(saved.speed, 10, 150));
        if (typeof saved.size === "number" && Number.isFinite(saved.size)) setSize(clamp(saved.size, 24, 96));
        if (typeof saved.mirror === "boolean") setMirror(saved.mirror);
      }
    } catch { /* Invalid preferences do not prevent rehearsal. */ }
    setPrefsReady(true);
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    if (navigator.wakeLock) void navigator.wakeLock.request("screen").then((value) => {
      if (disposed) void value.release(); else lock = value;
    }).catch(() => undefined);
    return () => { disposed = true; void lock?.release(); };
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ speed, size, mirror })); } catch { /* Preferences are optional. */ }
  }, [speed, size, mirror, prefsReady]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous: number | null = null;
    let position = scroll.current?.scrollTop ?? 0;
    let lastApplied = position;
    const advance = (now: number) => {
      const element = scroll.current;
      if (!element) return;
      if (Math.abs(element.scrollTop - lastApplied) > 2) position = element.scrollTop;
      if (previous !== null) position += Math.min(now - previous, 100) * speed / 1_000;
      previous = now;
      element.scrollTop = position;
      lastApplied = element.scrollTop;
      const max = element.scrollHeight - element.clientHeight;
      if (max > 0 && element.scrollTop >= max - 1) { setPlaying(false); return; }
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const usableGuide = guide && guide.blocks.map((block) => block.sourceText).join("").replace(/\s/g, "") === text.replace(/\s/g, "");
  const paragraphs = text.split(/\n+/u).filter((line) => line.trim());
  function rewind() { if (scroll.current) scroll.current.scrollTop = 0; setProgress(0); setPlaying(false); }

  return <dialog ref={dialog} aria-labelledby="prompter-title"
    className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 bg-[#101b17] p-0 text-[#f0f7f2] backdrop:bg-black/80"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (event.key === " ") { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key.toLowerCase() === "m") setMirror((value) => !value);
      if (event.key.toLowerCase() === "r") rewind();
      if (event.key === "[") setSpeed((value) => clamp(value - 5, 10, 150));
      if (event.key === "]") setSpeed((value) => clamp(value + 5, 10, 150));
      if (event.key === "+" || event.key === "=") setSize((value) => clamp(value + 4, 24, 96));
      if (event.key === "-") setSize((value) => clamp(value - 4, 24, 96));
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        scroll.current?.scrollBy({ top: (event.key === "ArrowUp" ? -1 : 1) * size * 1.8 });
      }
    }}>
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 px-5 py-4">
        <div><h2 id="prompter-title" className="font-display text-lg font-semibold">排练提词器</h2><p className="mt-1 text-xs text-[#a6bfb0]">{usableGuide ? guide.source === "ai" ? "AI 演绎指导 · " : guide.source === "rules" ? "基础规则提示（非 AI） · " : "历史提示 · " : ""}空格暂停 · ↑↓ 调整位置 · M 镜像 · R 重来 · Esc 退出</p></div>
        <div className="flex items-center gap-3"><span aria-live="off" className="text-sm tabular-nums">{progress}%</span><Button variant="secondary" size="sm" onClick={onClose}>退出提词</Button></div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[25%] z-10 border-t border-[#e4b665]/40"><span className="absolute -top-3 left-4 text-xl text-[#e4b665]">›</span></div>
        <div ref={scroll} tabIndex={0} aria-label="提词正文" className="h-full overflow-y-auto px-8 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e4b665]/50 md:px-20"
          onScroll={() => { const el = scroll.current; if (el) setProgress(Math.round(100 * el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight))); }}
          onClick={(event) => { if (!window.getSelection()?.toString()) { setPlaying((value) => !value); event.currentTarget.focus(); } }}>
          <div className="mx-auto max-w-5xl pb-[65vh] pt-[20vh]" style={{ fontSize: size, lineHeight: 1.8, transform: mirror ? "scaleX(-1)" : undefined }}>
            {usableGuide && hints ? <div className="mb-10 border-l-2 border-[#e4b665]/50 pl-4 text-base leading-8 text-[#a6bfb0]"><p>整体基调：{guide.overallTone}</p>{guide.paceHint ? <p>语速节奏：{guide.paceHint}</p> : null}{guide.cameraNote ? <p>出镜提醒：{guide.cameraNote}</p> : null}</div> : null}
            {usableGuide ? guide.blocks.flatMap((block, bi) => block.segments.map((segment, si) => <div key={`${bi}-${si}`} className="mb-8">
              <p className="whitespace-pre-wrap"><SpokenCueText text={segment.text} emphasis={segment.emphasis} dark /></p>
              {hints ? <div className="mt-2 space-y-1 text-base leading-7 text-[#a6bfb0]">
                <p>语气：{segment.toneHint || `${emotionLabel[segment.emotion]} ${segment.intensity}/3 · 语速：${paceLabel[segment.pace]}`}</p>
                {segment.pauseHint ? <p>停顿：{segment.pauseHint}</p> : guide.source !== "ai" ? <p>{pauseLabel[segment.pauseAfter]}{segment.breathBefore ? " · 句前换气" : ""}</p> : null}
                {segment.expression ? <p>表情：{segment.expression}</p> : null}
                <p>重读：{segment.emphasis.join("、") || "自然语重"}{segment.action ? ` · ${segment.action}` : ""}</p>
                {segment.spokenAs !== segment.text ? <p>念法：{segment.spokenAs}</p> : null}
              </div> : null}
            </div>)) : paragraphs.map((paragraph, index) => <p key={index} className="mb-8 whitespace-pre-wrap">{paragraph}</p>)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/15 px-5 py-4 text-sm">
        <Button onClick={() => { setPlaying((value) => !value); scroll.current?.focus(); }}>{playing ? "暂停" : "开始滚动"}</Button>
        <Button variant="secondary" onClick={rewind}>从头开始</Button>
        <label className="flex items-center gap-2">速度 <input aria-label="滚动速度" type="range" min={10} max={150} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="w-24 accent-[#e4b665]" /><span className="w-8 tabular-nums">{speed}</span></label>
        <label className="flex items-center gap-2">字号 <input aria-label="提词字号" type="range" min={24} max={96} value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-24 accent-[#e4b665]" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />镜像</label>
        {usableGuide ? <label className="flex items-center gap-2"><input type="checkbox" checked={hints} onChange={(event) => setHints(event.target.checked)} />语气与排练提示</label> : <span className="text-xs text-[#a6bfb0]">当前正文尚无匹配提示，请退出后点击“生成 AI 口播提示”</span>}
      </div>
    </div>
  </dialog>;
}
