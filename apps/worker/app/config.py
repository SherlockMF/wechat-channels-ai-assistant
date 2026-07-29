from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_mode: str = "MOCK"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/video_diagnosis"
    private_storage_root: Path = Path(".data/uploads")
    worker_poll_interval_seconds: float = 3.0
    max_key_frames: int = 40

    speech_provider: str = "mock"
    speech_api_base_url: str = ""
    speech_api_key: str = ""
    speech_model: str = "whisper-1"

    vision_provider: str = "mock"
    vision_api_base_url: str = ""
    vision_api_key: str = ""
    vision_model: str = ""

    llm_provider: str = "mock"
    llm_api_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""


settings = Settings()
