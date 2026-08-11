import json
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _overlay_user_settings(settings: "Settings") -> "Settings":
    path = Path(
        __import__("os").environ.get(
            "USER_SETTINGS_PATH",
            str(Path(".data") / "user-settings.json"),
        )
    )
    if not path.is_file():
        return settings
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return settings

    providers = payload.get("providers") or {}
    dashscope_key = str(providers.get("dashscopeApiKey") or "").strip()
    dashscope_base = str(providers.get("dashscopeApiBaseUrl") or "").strip()
    speech = providers.get("speech") or {}
    vision = providers.get("vision") or {}
    llm = providers.get("llm") or {}

    updates: dict[str, str] = {}

    # File wins over empty env; explicit provider blocks override dashscope fallback.
    if dashscope_key:
        updates["speech_api_key"] = dashscope_key
        updates["vision_api_key"] = dashscope_key
        updates["llm_api_key"] = dashscope_key
    if dashscope_base:
        updates["vision_api_base_url"] = dashscope_base
        updates["llm_api_base_url"] = dashscope_base

    speech_key = str(speech.get("apiKey") or "").strip()
    if speech_key:
        updates["speech_api_key"] = speech_key
    speech_base = str(speech.get("apiBaseUrl") or "").strip()
    if speech_base:
        updates["speech_api_base_url"] = speech_base
    speech_model = str(speech.get("model") or "").strip()
    if speech_model:
        updates["speech_model"] = speech_model
    speech_provider = str(speech.get("provider") or "").strip()
    if speech_provider:
        updates["speech_provider"] = speech_provider

    vision_key = str(vision.get("apiKey") or "").strip()
    if vision_key:
        updates["vision_api_key"] = vision_key
    vision_base = str(vision.get("apiBaseUrl") or "").strip()
    if vision_base:
        updates["vision_api_base_url"] = vision_base
    vision_model = str(vision.get("model") or "").strip()
    if vision_model:
        updates["vision_model"] = vision_model
    vision_provider = str(vision.get("provider") or "").strip()
    if vision_provider:
        updates["vision_provider"] = vision_provider

    llm_key = str(llm.get("apiKey") or "").strip()
    if llm_key:
        updates["llm_api_key"] = llm_key
    llm_base = str(llm.get("apiBaseUrl") or "").strip()
    if llm_base:
        updates["llm_api_base_url"] = llm_base
    llm_model = str(llm.get("model") or "").strip()
    if llm_model:
        updates["llm_model"] = llm_model
    llm_provider = str(llm.get("provider") or "").strip()
    if llm_provider:
        updates["llm_provider"] = llm_provider

    if not updates:
        return settings
    return settings.model_copy(update=updates)


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
    speech_model: str = "qwen-audio-3.0-asr-flash"

    vision_provider: str = "mock"
    vision_api_base_url: str = ""
    vision_api_key: str = ""
    vision_model: str = ""

    llm_provider: str = "mock"
    llm_api_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""


settings = Settings()


def get_settings() -> Settings:
    """Re-apply user-settings.json so API keys saved in the Web UI take effect without rebuild."""
    return _overlay_user_settings(Settings())
