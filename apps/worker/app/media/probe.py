import json
import subprocess
from pathlib import Path

from pydantic import BaseModel


class MediaMetadata(BaseModel):
    duration_seconds: float
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    has_audio: bool = False
    video_codec: str | None = None
    audio_codec: str | None = None


def _rate(value: str | None) -> float | None:
    if not value:
        return None
    numerator, denominator = value.split("/", maxsplit=1)
    return float(numerator) / float(denominator) if float(denominator) else None


def probe_media(video_path: Path) -> MediaMetadata:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate",
            "-of",
            "json",
            str(video_path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=45,
    )
    payload = json.loads(completed.stdout)
    video = next(
        (stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video"),
        {},
    )
    audio = next(
        (stream for stream in payload.get("streams", []) if stream.get("codec_type") == "audio"),
        {},
    )
    return MediaMetadata(
        duration_seconds=float(payload["format"]["duration"]),
        width=video.get("width"),
        height=video.get("height"),
        fps=_rate(video.get("r_frame_rate")),
        has_audio=bool(audio),
        video_codec=video.get("codec_name"),
        audio_codec=audio.get("codec_name"),
    )
