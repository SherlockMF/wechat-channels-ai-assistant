import subprocess
from pathlib import Path


def extract_audio(video_path: Path, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            str(output_path),
        ],
        check=True,
        timeout=180,
    )
    return output_path


def extract_key_frames(
    video_path: Path,
    output_dir: Path,
    duration_seconds: float,
    maximum: int,
) -> list[tuple[float, Path]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    dense = [0, 1, 2, 3, 5, 7, 10]
    sparse = list(range(15, max(16, int(duration_seconds)), 5))
    timestamps = sorted({float(value) for value in [*dense, *sparse] if value <= duration_seconds})
    frames: list[tuple[float, Path]] = []
    for index, second in enumerate(timestamps[:maximum]):
        output_path = output_dir / f"frame-{index:03d}-{second:.2f}.jpg"
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                f"{second:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-q:v",
                "3",
                str(output_path),
            ],
            check=True,
            timeout=45,
        )
        frames.append((second, output_path))
    return frames
