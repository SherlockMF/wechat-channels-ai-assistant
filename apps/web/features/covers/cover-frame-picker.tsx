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
  onConfirm: (second: number, frame: File) => Promise<void> | void;
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

  async function captureFrame(): Promise<File> {
    const video = videoRef.current;
    if (!video) throw new Error("视频尚未加载");
    if (Math.abs(video.currentTime - second) > 0.05) {
      await new Promise<void>((resolve, reject) => {
        const done = () => resolve();
        const failed = () => reject(new Error("无法定位到该画面"));
        video.addEventListener("seeked", done, { once: true });
        video.addEventListener("error", failed, { once: true });
        video.currentTime = second;
      });
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("无法读取视频画面");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持画面截取");
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) throw new Error("画面截取失败");
    return new File([blob], `frame-${second.toFixed(1)}.jpg`, {
      type: "image/jpeg",
    });
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm(second, await captureFrame());
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
