import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from psycopg import AsyncConnection

from app.config import settings
from app.jobs.processor import worker_loop


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop_event = asyncio.Event()
    task = None
    if settings.app_mode.upper() == "REAL":
        task = asyncio.create_task(worker_loop(stop_event))
    yield
    stop_event.set()
    if task:
        await task


app = FastAPI(
    title="视频号内容诊断 Worker",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mode": settings.app_mode,
        "workerPolling": settings.app_mode.upper() == "REAL",
    }


@app.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str):
    async with await AsyncConnection.connect(settings.database_url) as connection:
        cursor = await connection.execute(
            """
            UPDATE analysis_jobs
            SET status='queued', progress=0, current_step='queued',
                retry_count=retry_count+1, error_code=NULL, error_message=NULL,
                started_at=NULL, completed_at=NULL
            WHERE id=%s AND status IN ('failed','cancelled')
            RETURNING id
            """,
            (job_id,),
        )
        row = await cursor.fetchone()
        await connection.commit()
    if not row:
        raise HTTPException(status_code=404, detail="任务不存在或当前不可重试")
    return {"jobId": job_id, "status": "queued"}
