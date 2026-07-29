from abc import ABC, abstractmethod
from pathlib import Path

from pydantic import BaseModel


class FrameDescription(BaseModel):
    second: float
    description: str
    confidence: float


class VisionProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def describe(self, frames: list[tuple[float, Path]]) -> list[FrameDescription]:
        raise NotImplementedError


class MockVisionProvider(VisionProvider):
    name = "mock"
    model = "mock-vision-v1"

    async def describe(self, frames: list[tuple[float, Path]]) -> list[FrameDescription]:
        return [
            FrameDescription(
                second=second,
                description="关键帧已提取；未启用视觉模型，需人工确认主体与字幕。",
                confidence=0.2,
            )
            for second, _ in frames
        ]


def vision_provider() -> VisionProvider:
    return MockVisionProvider()
