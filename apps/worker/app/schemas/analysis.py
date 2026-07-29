from typing import Literal

from pydantic import BaseModel, Field, model_validator


Confidence = Literal["low", "medium", "high"]


class DataAssessment(BaseModel):
    performanceLevel: Literal["low", "normal", "high"]
    sampleConfidence: Confidence
    facts: list[str] = Field(min_length=1)


class PrimaryProblem(BaseModel):
    category: Literal["hook", "copy", "visual", "subtitle", "pacing", "audio", "structure"]
    severity: Literal["high", "medium", "low"]
    startSecond: float = Field(ge=0)
    endSecond: float = Field(gt=0)
    contentEvidence: list[str]
    dataEvidence: list[str]
    inference: str
    recommendation: str
    expectedMetric: Literal[
        "completion_rate",
        "average_watch_seconds",
        "like_rate",
        "comment_rate",
        "share_rate",
        "follow_rate",
    ]
    confidence: Confidence

    @model_validator(mode="after")
    def validate_range(self):
        if self.endSecond <= self.startSecond:
            raise ValueError("endSecond must be greater than startSecond")
        return self


class SourceAsset(BaseModel):
    sourceStartSecond: float = Field(ge=0)
    sourceEndSecond: float = Field(gt=0)


class EditingItem(BaseModel):
    startSecond: float = Field(ge=0)
    endSecond: float = Field(gt=0)
    originalContent: str
    problem: str
    action: Literal[
        "delete",
        "trim",
        "replace",
        "move_forward",
        "speed_up",
        "add_subtitle",
        "change_audio",
        "reshoot",
        "keep",
    ]
    replacementContent: str
    sourceAsset: SourceAsset | None = None
    requiresReshoot: bool


class RevisedOpeningItem(BaseModel):
    startSecond: float = Field(ge=0)
    endSecond: float = Field(gt=0)
    visual: str
    voiceover: str
    subtitle: str
    audio: str
    editingRhythm: str
    sourceAssetStartSecond: float | None = Field(default=None, ge=0)
    sourceAssetEndSecond: float | None = Field(default=None, gt=0)
    requiresReshoot: bool


class HookAlternative(BaseModel):
    type: Literal["result", "pain_point", "suspense"]
    voiceover: str
    subtitle: str
    visual: str


class CopySuggestions(BaseModel):
    originalSummary: str
    revisedFullScript: str
    subtitleVersion: str
    cta: str


class AudioSuggestions(BaseModel):
    currentIssues: list[str]
    musicMood: str
    bpmRange: str | None = None
    openingAudioAction: str
    voiceMusicBalance: str
    transitionSuggestions: list[str]
    avoid: list[str]


class DiagnosisResult(BaseModel):
    executiveSummary: str
    dataAssessment: DataAssessment
    primaryProblems: list[PrimaryProblem] = Field(max_length=3)
    editingPlan: list[EditingItem]
    revisedOpening: list[RevisedOpeningItem]
    hookAlternatives: list[HookAlternative] = Field(min_length=2, max_length=3)
    copySuggestions: CopySuggestions
    audioSuggestions: AudioSuggestions
    limitations: list[str] = Field(min_length=1)


class TimelineSegment(BaseModel):
    start_second: float
    end_second: float
    shot_type: str = "unknown"
    information_function: str = "unknown"
    visual_description: str
    spoken_text: str | None = None
    subtitle_text: str | None = None
    audio_description: str | None = None
    is_static: bool = False
    is_repeated: bool = False
    is_silent: bool = False
    confidence: float = Field(ge=0, le=1)
