import asyncio
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from psycopg import AsyncConnection
from psycopg.rows import dict_row

from app.analysis.rules import build_rule_result
from app.config import settings
from app.media.extract import extract_audio, extract_key_frames
from app.media.probe import probe_media
from app.providers.speech import speech_provider
from app.providers.vision import vision_provider


STEPS = {
    "extracting_metadata": 10,
    "extracting_audio": 24,
    "transcribing": 42,
    "detecting_scenes": 58,
    "analysing_frames": 72,
    "generating_diagnosis": 88,
}


async def update_job(connection: AsyncConnection, job_id: str, step: str) -> None:
    await connection.execute(
        "UPDATE analysis_jobs SET current_step=%s, progress=%s WHERE id=%s",
        (step, STEPS[step], job_id),
    )
    await connection.commit()


async def claim_job(connection: AsyncConnection) -> dict | None:
    async with connection.transaction():
        cursor = await connection.execute(
            """
            SELECT j.*, a.storage_path, a.mime_type, r.description, r.completion_rate,
                   r.average_watch_seconds, r.views
            FROM analysis_jobs j
            JOIN video_assets a ON a.id = j.video_asset_id
            JOIN video_records r ON r.id = j.video_record_id
            WHERE j.status = 'queued'
            ORDER BY j.created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        job = await cursor.fetchone()
        if not job:
            return None
        await connection.execute(
            """
            UPDATE analysis_jobs
            SET status='processing', progress=2, current_step='extracting_metadata',
                started_at=now(), error_code=NULL, error_message=NULL
            WHERE id=%s
            """,
            (job["id"],),
        )
        return job


async def process_job(connection: AsyncConnection, job: dict) -> None:
    job_id = str(job["id"])
    video_path = Path(job["storage_path"])
    work_dir = video_path.parent / ".processing" / job_id
    try:
        await update_job(connection, job_id, "extracting_metadata")
        metadata = await asyncio.to_thread(probe_media, video_path)

        transcript = None
        provider = speech_provider()
        if metadata.has_audio:
            await update_job(connection, job_id, "extracting_audio")
            audio_path = await asyncio.to_thread(
                extract_audio, video_path, work_dir / "audio.wav"
            )
            await update_job(connection, job_id, "transcribing")
            transcript = await provider.transcribe(audio_path)

        await update_job(connection, job_id, "detecting_scenes")
        frames = await asyncio.to_thread(
            extract_key_frames,
            video_path,
            work_dir / "frames",
            metadata.duration_seconds,
            settings.max_key_frames,
        )
        await update_job(connection, job_id, "analysing_frames")
        frame_descriptions = await vision_provider().describe(frames)

        await update_job(connection, job_id, "generating_diagnosis")
        result = build_rule_result(job, metadata.duration_seconds)
        now = datetime.now(timezone.utc)
        async with connection.transaction():
            await connection.execute(
                """
                UPDATE video_assets
                SET duration_seconds=%s, width=%s, height=%s, fps=%s,
                    processing_status='processed'
                WHERE id=%s
                """,
                (
                    metadata.duration_seconds,
                    metadata.width,
                    metadata.height,
                    metadata.fps,
                    job["video_asset_id"],
                ),
            )
            if transcript is not None:
                await connection.execute(
                    """
                    INSERT INTO video_transcripts
                      (video_asset_id, full_text, language, provider, model, confidence, segments_json)
                    VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)
                    """,
                    (
                        job["video_asset_id"],
                        transcript.text,
                        transcript.language,
                        provider.name,
                        provider.model,
                        transcript.confidence,
                        transcript.model_dump_json(include={"segments"}),
                    ),
                )
            for index, description in enumerate(frame_descriptions[:10]):
                start = description.second
                end = min(metadata.duration_seconds, max(start + 0.5, start + 1))
                await connection.execute(
                    """
                    INSERT INTO video_segments
                      (video_asset_id, start_second, end_second, shot_type,
                       information_function, visual_description, is_static,
                       is_repeated, is_silent, key_frame_path, confidence)
                    VALUES (%s,%s,%s,'unknown','unknown',%s,false,false,false,%s,%s)
                    """,
                    (
                        job["video_asset_id"],
                        start,
                        end,
                        description.description,
                        str(frames[index][1]) if index < len(frames) else None,
                        description.confidence,
                    ),
                )
            await connection.execute(
                """
                INSERT INTO analysis_results
                  (analysis_job_id, data_summary_json, result_json, limitations_json,
                   analysis_version, rule_engine_version, prompt_version,
                   speech_provider, speech_model, vision_provider, vision_model,
                   llm_provider, llm_model)
                VALUES (%s,%s::jsonb,%s::jsonb,%s::jsonb,
                        'analysis-v1.0.0','rules-v1.0.0','diagnosis-v1.0.0',
                        %s,%s,%s,%s,%s,%s)
                """,
                (
                    job_id,
                    json.dumps(result.dataAssessment.model_dump(), ensure_ascii=False),
                    result.model_dump_json(),
                    json.dumps(result.limitations, ensure_ascii=False),
                    provider.name,
                    provider.model,
                    vision_provider().name,
                    vision_provider().model,
                    settings.llm_provider,
                    settings.llm_model or "rules-only",
                ),
            )
            await connection.execute(
                """
                UPDATE analysis_jobs
                SET status='completed', progress=100, current_step='completed',
                    completed_at=%s
                WHERE id=%s
                """,
                (now, job_id),
            )
    except Exception as error:
        await connection.rollback()
        await connection.execute(
            """
            UPDATE analysis_jobs
            SET status='failed', current_step='failed', error_code=%s,
                error_message=%s, completed_at=now()
            WHERE id=%s
            """,
            (type(error).__name__, str(error)[:1000], job_id),
        )
        await connection.commit()
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def worker_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            async with await AsyncConnection.connect(
                settings.database_url, row_factory=dict_row
            ) as connection:
                job = await claim_job(connection)
                if job:
                    await process_job(connection, job)
                else:
                    await asyncio.wait_for(
                        stop_event.wait(), timeout=settings.worker_poll_interval_seconds
                    )
        except TimeoutError:
            continue
        except Exception:
            try:
                await asyncio.wait_for(
                    stop_event.wait(), timeout=settings.worker_poll_interval_seconds
                )
            except TimeoutError:
                continue
