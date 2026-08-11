import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  hasSpeechEvidenceCredentials,
  transcribeDraftAudio,
  type DraftTranscriptEvidence,
} from "@/lib/draft-review/speech-evidence";
import { describeDraftEvidenceFrames } from "@/lib/draft-review/visual-evidence";

const execFileAsync = promisify(execFile);
const MAX_EVIDENCE_FRAMES = 36;
const MAX_SYNC_ASR_SECONDS = 295;

export type DraftEvidenceProgressStep =
  | "extracting_audio"
  | "transcribing"
  | "extracting_frames"
  | "recognizing_subtitles";

export interface DraftEvidenceExtractionOptions {
  onProgress?: (
    step: DraftEvidenceProgressStep,
    progress: number,
  ) => void | Promise<void>;
}

export interface DraftEvidenceFrame {
  second: number;
  imagePath: string;
  description: string | null;
  ocrText: string | null;
  duplicateOfSecond: number | null;
}

export interface DraftEvidenceManifest {
  durationSeconds: number;
  openingBoard: string;
  fullBoard: string;
  combinedBoard: string;
  /** 旧版云端证据可能没有以下增强字段。 */
  audioPath?: string | null;
  transcript?: DraftTranscriptEvidence | null;
  frames?: DraftEvidenceFrame[];
  sceneCutSeconds: number[];
  silenceRanges: Array<{ start: number; end: number }>;
  title: string | null;
  goal: string | null;
  tags: string[];
  limitations?: string[];
}

async function run(command: string, args: string[]) {
  try {
    return await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    const details = [
      (error as { stdout?: string }).stdout,
      (error as { stderr?: string }).stderr,
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `${command} failed: ${details || (error instanceof Error ? error.message : "unknown error")}`,
    );
  }
}

function errorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\s+/gu, " ").slice(0, 300);
}

function numbers(pattern: RegExp, text: string): number[] {
  return [...text.matchAll(pattern)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
}

function timestampFilter(): string {
  const font =
    process.platform === "win32"
      ? "fontfile='C\\:/Windows/Fonts/arial.ttf'"
      : "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  return `drawtext=${font}:text='%{pts\\:hms}':fontcolor=white:fontsize=18:box=1:boxcolor=black@0.65:x=6:y=h-th-6`;
}

/** 重点覆盖前三秒，并从 10 秒后按 5 秒取样，最多 36 帧。 */
export function selectEvidenceFrameSeconds(
  durationSeconds: number,
  maxFrames = MAX_EVIDENCE_FRAMES,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || maxFrames <= 0) {
    return [];
  }
  const candidates = [0, 1, 2, 3, 5, 7, 10];
  for (let second = 15; candidates.length < maxFrames; second += 5) {
    candidates.push(second);
  }
  return candidates
    .filter((second, index) => index === 0 || second < durationSeconds)
    .slice(0, maxFrames);
}

async function extractFrames(
  videoPath: string,
  outputDirectory: string,
  seconds: number[],
): Promise<{ frames: DraftEvidenceFrame[]; failed: number }> {
  const frameDirectory = path.join(outputDirectory, "frames");
  await fs.mkdir(frameDirectory, { recursive: true });
  const frames: DraftEvidenceFrame[] = [];
  let failed = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    const second = seconds[index]!;
    const imagePath = path.join(
      frameDirectory,
      `frame-${String(index).padStart(2, "0")}-${second.toFixed(1).replace(".", "_")}s.jpg`,
    );
    try {
      await run("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-ss",
        String(second),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(720,iw)':-2",
        imagePath,
      ]);
      frames.push({
        second,
        imagePath,
        description: null,
        ocrText: null,
        duplicateOfSecond: null,
      });
    } catch {
      failed += 1;
    }
  }
  return { frames, failed };
}

async function extractAudioEvidence(
  videoPath: string,
  outputDirectory: string,
  durationSeconds: number,
  onTranscribing?: () => void | Promise<void>,
): Promise<{
  audioPath: string | null;
  transcript: DraftTranscriptEvidence | null;
  limitations: string[];
}> {
  const limitations: string[] = [];
  const audioPath = path.join(outputDirectory, "speech-16k-mono.wav");
  try {
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      videoPath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-t",
      String(Math.min(durationSeconds, MAX_SYNC_ASR_SECONDS)),
      audioPath,
    ]);
    const stat = await fs.stat(audioPath);
    if (stat.size <= 44) throw new Error("音轨为空");
  } catch (error) {
    limitations.push(`未能提取 16kHz 单声道音轨：${errorMessage(error)}。`);
    return { audioPath: null, transcript: null, limitations };
  }
  if (durationSeconds > MAX_SYNC_ASR_SECONDS) {
    limitations.push(
      `同步 ASR 单次最多处理前 ${MAX_SYNC_ASR_SECONDS} 秒，后续口播未转写。`,
    );
  }
  if (!hasSpeechEvidenceCredentials()) {
    limitations.push("未配置 Speech API Key；已保留 16kHz 单声道音轨，但未生成口播转写。");
    return { audioPath, transcript: null, limitations };
  }
  try {
    await onTranscribing?.();
    const transcript = await transcribeDraftAudio(
      audioPath,
      Math.min(durationSeconds, MAX_SYNC_ASR_SECONDS),
    );
    if (transcript.segments.length === 0) {
      limitations.push(
        "当前 Speech provider 仅返回 ASR 全文、没有可信句级时间码；逐时码意见只引用画面/OCR，口播需人工对时。",
      );
    }
    return {
      audioPath,
      transcript,
      limitations,
    };
  } catch (error) {
    limitations.push(`口播转写失败：${errorMessage(error)}。`);
    return { audioPath, transcript: null, limitations };
  }
}

export async function extractDraftEvidence(
  videoPath: string,
  outputDirectory: string,
  meta: { title: string | null; goal: string | null; tags?: string[] },
  options: DraftEvidenceExtractionOptions = {},
): Promise<DraftEvidenceManifest> {
  await fs.mkdir(outputDirectory, { recursive: true });
  const probe = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        videoPath,
      ])
    ).stdout,
  ) as { format?: { duration?: string } };
  const durationSeconds = Number(probe.format?.duration ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("无法读取视频时长");
  }

  const limitations: string[] = [];
  const openingBoard = path.join(outputDirectory, "opening-board.jpg");
  const fullBoard = path.join(outputDirectory, "full-board.jpg");
  const combinedBoard = path.join(outputDirectory, "combined-board.jpg");
  const openingDuration = Math.min(10, durationSeconds);
  const timestamp = timestampFilter();

  const openingResult = await Promise.allSettled([
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      `trim=duration=${openingDuration},fps=${10 / openingDuration},scale=200:-2,${timestamp},tile=5x2`,
      "-frames:v",
      "1",
      openingBoard,
    ]),
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      `fps=${12 / durationSeconds},scale=250:-2,${timestamp},tile=4x3`,
      "-frames:v",
      "1",
      fullBoard,
    ]),
  ]);
  if (openingResult[0].status === "rejected") {
    limitations.push(`开头分镜板生成失败：${errorMessage(openingResult[0].reason)}。`);
  }
  if (openingResult[1].status === "rejected") {
    limitations.push(`全片分镜板生成失败：${errorMessage(openingResult[1].reason)}。`);
  }
  if (openingResult.every((item) => item.status === "fulfilled")) {
    try {
      await run("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-i",
        openingBoard,
        "-i",
        fullBoard,
        "-filter_complex",
        "[0:v][1:v]vstack=inputs=2",
        "-frames:v",
        "1",
        combinedBoard,
      ]);
    } catch (error) {
      limitations.push(`组合分镜板生成失败：${errorMessage(error)}。`);
    }
  }

  const [sceneResult, silenceResult] = await Promise.allSettled([
    run("ffmpeg", [
      "-v",
      "info",
      "-i",
      videoPath,
      "-vf",
      "select=gt(scene\\,0.28),showinfo",
      "-an",
      "-f",
      "null",
      "-",
    ]),
    run("ffmpeg", [
      "-v",
      "info",
      "-i",
      videoPath,
      "-af",
      "silencedetect=noise=-40dB:d=0.4",
      "-vn",
      "-f",
      "null",
      "-",
    ]),
  ]);
  const sceneCutSeconds =
    sceneResult.status === "fulfilled"
      ? numbers(
          /pts_time:([0-9]+(?:\.[0-9]+)?)/gu,
          `${sceneResult.value.stdout}\n${sceneResult.value.stderr}`,
        ).slice(0, 80)
      : [];
  if (sceneResult.status === "rejected") {
    limitations.push(`镜头切换检测失败：${errorMessage(sceneResult.reason)}。`);
  }
  let silenceRanges: Array<{ start: number; end: number }> = [];
  if (silenceResult.status === "fulfilled") {
    const silenceText = `${silenceResult.value.stdout}\n${silenceResult.value.stderr}`;
    const starts = numbers(/silence_start: ([0-9]+(?:\.[0-9]+)?)/gu, silenceText);
    const ends = numbers(/silence_end: ([0-9]+(?:\.[0-9]+)?)/gu, silenceText);
    silenceRanges = starts
      .map((start, index) => ({ start, end: ends[index] ?? start }))
      .filter((range) => range.end > range.start);
  } else {
    limitations.push(`静音检测失败：${errorMessage(silenceResult.reason)}。`);
  }

  await options.onProgress?.("extracting_audio", 30);
  const audio = await extractAudioEvidence(
    videoPath,
    outputDirectory,
    durationSeconds,
    () => options.onProgress?.("transcribing", 42),
  );
  limitations.push(...audio.limitations);

  await options.onProgress?.("extracting_frames", 55);
  const extractedFrames = await extractFrames(
    videoPath,
    outputDirectory,
    selectEvidenceFrameSeconds(durationSeconds),
  );
  if (extractedFrames.failed > 0) {
    limitations.push(
      `${extractedFrames.failed} 张时间帧提取失败；相关秒点没有视觉证据。`,
    );
  }
  await options.onProgress?.("recognizing_subtitles", 70);
  const visual = await describeDraftEvidenceFrames(extractedFrames.frames);
  limitations.push(...visual.limitations);

  const manifest: DraftEvidenceManifest = {
    durationSeconds,
    openingBoard:
      openingResult[0].status === "fulfilled" ? openingBoard : "",
    fullBoard: openingResult[1].status === "fulfilled" ? fullBoard : "",
    combinedBoard:
      openingResult.every((item) => item.status === "fulfilled") &&
      !limitations.some((item) => item.startsWith("组合分镜板生成失败"))
        ? combinedBoard
        : "",
    audioPath: audio.audioPath,
    transcript: audio.transcript,
    frames: visual.frames,
    sceneCutSeconds,
    silenceRanges,
    title: meta.title,
    goal: meta.goal,
    tags: meta.tags ?? [],
    limitations,
  };
  await fs.writeFile(
    path.join(outputDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  return manifest;
}
