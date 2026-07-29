import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const statePath = path.join(root, ".data", "local-state.json");
const outputRoot = path.join(root, ".data", "codex-analysis", "recent-10");

async function run(command, args) {
  try {
    return await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} failed: ${details || error.message}`);
  }
}

function latestRows(state) {
  return state.matches
    .filter((match) => match.status === "matched" && match.videoRecordId)
    .map((match) => ({
      match,
      record: state.records.find(
        (record) => record.id === match.videoRecordId,
      ),
      asset: state.assets.find((asset) => asset.id === match.videoAssetId),
    }))
    .filter(({ record, asset }) => record && asset)
    .sort(
      (left, right) =>
        new Date(right.record.publishedAt).getTime() -
          new Date(left.record.publishedAt).getTime() ||
        left.record.spreadsheetRow - right.record.spreadsheetRow,
    )
    .slice(0, 10);
}

function numbers(pattern, text) {
  return [...text.matchAll(pattern)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
}

await fs.mkdir(outputRoot, { recursive: true });
const state = JSON.parse(await fs.readFile(statePath, "utf8"));
const rows = latestRows(state);
const manifest = [];

for (const [index, { record, asset }] of rows.entries()) {
  const rank = index + 1;
  const prefix = String(rank).padStart(2, "0");
  const probe = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
        "-of",
        "json",
        asset.storagePath,
      ])
    ).stdout,
  );
  const durationSeconds = Number(probe.format?.duration ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`无法读取视频时长：${asset.storagePath}`);
  }
  const openingPath = path.join(outputRoot, `${prefix}-opening.jpg`);
  const fullPath = path.join(outputRoot, `${prefix}-full.jpg`);
  const boardPath = path.join(outputRoot, `${prefix}-board.jpg`);
  const timestamp =
    "drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{pts\\:hms}':fontcolor=white:fontsize=18:box=1:boxcolor=black@0.65:x=6:y=h-th-6";
  const openingDuration = Math.min(10, durationSeconds);
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    asset.storagePath,
    "-vf",
    `trim=duration=${openingDuration},fps=${10 / openingDuration},scale=200:-2,${timestamp},tile=5x2`,
    "-frames:v",
    "1",
    openingPath,
  ]);
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    asset.storagePath,
    "-vf",
    `fps=${12 / durationSeconds},scale=250:-2,${timestamp},tile=4x3`,
    "-frames:v",
    "1",
    fullPath,
  ]);
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    openingPath,
    "-i",
    fullPath,
    "-filter_complex",
    "[0:v][1:v]vstack=inputs=2",
    "-frames:v",
    "1",
    boardPath,
  ]);

  const sceneScan = await run("ffmpeg", [
    "-v",
    "info",
    "-i",
    asset.storagePath,
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
    asset.storagePath,
    "-af",
    "silencedetect=noise=-40dB:d=0.4",
    "-vn",
    "-f",
    "null",
    "-",
  ]);
  const sceneTimes = numbers(
    /pts_time:([0-9]+(?:\.[0-9]+)?)/gu,
    `${sceneScan.stdout}\n${sceneScan.stderr}`,
  ).slice(0, 80);
  const silenceText = `${silenceScan.stdout}\n${silenceScan.stderr}`;
  const silenceStarts = numbers(
    /silence_start: ([0-9]+(?:\.[0-9]+)?)/gu,
    silenceText,
  );
  const silenceEnds = numbers(
    /silence_end: ([0-9]+(?:\.[0-9]+)?)/gu,
    silenceText,
  );
  manifest.push({
    rank,
    recordId: record.id,
    videoAssetId: asset.id,
    title: record.description,
    publishedAt: record.publishedAt,
    metrics: {
      views: record.views,
      completionRate: record.completionRate,
      averageWatchSeconds: record.averageWatchSeconds,
      likes: record.likes,
      comments: record.comments,
      shares: record.shares,
      follows: record.follows,
    },
    media: {
      durationSeconds,
      streams: probe.streams ?? [],
      bitRate: probe.format?.bit_rate
        ? Number(probe.format.bit_rate)
        : null,
      sceneChangeTimes: sceneTimes,
      silenceIntervals: silenceStarts.map((start, silenceIndex) => ({
        start,
        end: silenceEnds[silenceIndex] ?? null,
      })),
    },
    evidenceBoardPath: boardPath,
    openingBoardPath: openingPath,
    fullBoardPath: fullPath,
    sourceVideoPath: asset.storagePath,
  });
  process.stdout.write(
    `${rank}/10 ${record.description.replace(/\s+/gu, " ").slice(0, 42)}\n`,
  );
}

const manifestPath = path.join(outputRoot, "manifest.json");
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(manifestPath);
