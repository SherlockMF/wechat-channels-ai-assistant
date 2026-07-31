import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export interface DraftEvidenceManifest {
  durationSeconds: number;
  openingBoard: string;
  fullBoard: string;
  combinedBoard: string;
  sceneCutSeconds: number[];
  silenceRanges: Array<{ start: number; end: number }>;
  title: string | null;
  goal: string | null;
  tags: string[];
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

export async function extractDraftEvidence(
  videoPath: string,
  outputDirectory: string,
  meta: { title: string | null; goal: string | null; tags?: string[] },
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

  const openingBoard = path.join(outputDirectory, "opening-board.jpg");
  const fullBoard = path.join(outputDirectory, "full-board.jpg");
  const combinedBoard = path.join(outputDirectory, "combined-board.jpg");
  const openingDuration = Math.min(10, durationSeconds);
  const timestamp = timestampFilter();

  await run("ffmpeg", [
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
  ]);
  await run("ffmpeg", [
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
  ]);
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

  const sceneScan = await run("ffmpeg", [
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
  ]);
  const silenceScan = await run("ffmpeg", [
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
  ]);
  const sceneCutSeconds = numbers(
    /pts_time:([0-9]+(?:\.[0-9]+)?)/gu,
    `${sceneScan.stdout}\n${sceneScan.stderr}`,
  ).slice(0, 80);
  const silenceText = `${silenceScan.stdout}\n${silenceScan.stderr}`;
  const silenceStarts = numbers(/silence_start: ([0-9]+(?:\.[0-9]+)?)/gu, silenceText);
  const silenceEnds = numbers(/silence_end: ([0-9]+(?:\.[0-9]+)?)/gu, silenceText);
  const silenceRanges = silenceStarts
    .map((start, index) => ({
      start,
      end: silenceEnds[index] ?? start,
    }))
    .filter((range) => range.end > range.start);

  const manifest: DraftEvidenceManifest = {
    durationSeconds,
    openingBoard,
    fullBoard,
    combinedBoard,
    sceneCutSeconds,
    silenceRanges,
    title: meta.title,
    goal: meta.goal,
    tags: meta.tags ?? [],
  };
  await fs.writeFile(
    path.join(outputDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  return manifest;
}
