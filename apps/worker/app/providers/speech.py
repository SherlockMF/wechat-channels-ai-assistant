from abc import ABC, abstractmethod
from pathlib import Path

import httpx
from pydantic import BaseModel

from app.config import get_settings


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    confidence: float | None = None


class Transcript(BaseModel):
    text: str
    language: str | None = None
    confidence: float | None = None
    segments: list[TranscriptSegment] = []


class SpeechToTextProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def transcribe(self, audio_path: Path) -> Transcript:
        raise NotImplementedError


class MockSpeechProvider(SpeechToTextProvider):
    name = "mock"
    model = "mock-transcript-v1"

    async def transcribe(self, audio_path: Path) -> Transcript:
        return Transcript(
            text="",
            language="zh",
            confidence=0,
            segments=[],
        )


class OpenAICompatibleSpeechProvider(SpeechToTextProvider):
    name = "openai-compatible"

    def __init__(self) -> None:
        settings = get_settings()
        self.model = settings.speech_model

    async def transcribe(self, audio_path: Path) -> Transcript:
        settings = get_settings()
        if not settings.speech_api_key or not settings.speech_api_base_url:
            raise RuntimeError("SPEECH_API_KEY 或 SPEECH_API_BASE_URL 未配置")
        async with httpx.AsyncClient(timeout=180) as client:
            with audio_path.open("rb") as stream:
                response = await client.post(
                    f"{settings.speech_api_base_url.rstrip('/')}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {settings.speech_api_key}"},
                    data={
                        "model": settings.speech_model,
                        "response_format": "verbose_json",
                        "timestamp_granularities[]": "segment",
                    },
                    files={"file": (audio_path.name, stream, "audio/wav")},
                )
        response.raise_for_status()
        payload = response.json()
        return Transcript(
            text=payload.get("text", ""),
            language=payload.get("language"),
            segments=[
                TranscriptSegment(
                    start=item["start"],
                    end=item["end"],
                    text=item["text"],
                    confidence=item.get("confidence"),
                )
                for item in payload.get("segments", [])
            ],
        )


def speech_provider() -> SpeechToTextProvider:
    settings = get_settings()
    if settings.speech_provider == "mock":
        return MockSpeechProvider()
    return OpenAICompatibleSpeechProvider()
