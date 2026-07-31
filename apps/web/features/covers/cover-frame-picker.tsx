"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";

export function CoverFramePicker({
  videoUrl,
  durationSeconds,
  initialSecond = 1,
  onConfirm,
  onCancel,
}: {
  videoUrl: string;
  durationSeconds: number | null;
  initialSecond?: number;
  onConfirm: (second: number) => Promise<void> | void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxSecond = Math.max(0.1, (durationSeconds ?? 60) - 0.05);
  const [second, setSecond] = useState(Math.min(initialSecond, maxSecond));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const seek = () => {
      video.currentTime = second;
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
  }, [second, videoUrl]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm(second);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "截帧失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <video
        ref={videoRef}
        src={videoUrl}
        className="aspect-video w-full rounded-xl bg-black object-contain"
        muted
        playsInline
        preload="metadata"
      />
      <label className="block text-sm font-bold text-[#52615a]">
        截取时刻：{second.toFixed(1)} 秒
        <input
          type="range"
          min={0}
          max={maxSecond}
          step={0.1}
          value={second}
          disabled={busy}
          onChange={(event) => setSecond(Number(event.target.value))}
          className="mt-2 w-full"
        />
      </label>
      {error && <p className="text-sm text-coral">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => void confirm()}>
          {busy ? "截取中…" : "确认作为封面"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          取消
        </Button>
      </div>
    </Card>
  );
}
