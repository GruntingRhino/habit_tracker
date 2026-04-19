import os
import pathlib
import platform
from dataclasses import dataclass
from dotenv import load_dotenv

# Load .env from the same directory as this file
_HERE = pathlib.Path(__file__).parent
load_dotenv(_HERE / ".env")


@dataclass
class Config:
    habit_tracker_url: str
    habit_email: str
    habit_password: str
    ollama_base_url: str
    ollama_model: str
    session_cache_file: pathlib.Path
    log_dir: pathlib.Path
    panel_width: int = 440
    font_family: str = "Courier"
    bg_color: str = "#0a0a0a"
    fg_color: str = "#e8e8e8"
    accent_color: str = "#00ff88"
    warn_color: str = "#ff4444"
    mid_color: str = "#ffaa00"
    dim_color: str = "#555555"
    bar_color: str = "#333333"
    header_bg: str = "#111111"
    input_bg: str = "#141414"


def load_config() -> Config:
    home = pathlib.Path.home()

    if platform.system() == "Darwin":
        log_dir = home / "Library" / "Logs" / "HabitCoach"
    else:
        log_dir = home / "AppData" / "Roaming" / "HabitCoach"

    log_dir.mkdir(parents=True, exist_ok=True)

    return Config(
        habit_tracker_url=os.getenv(
            "HABIT_TRACKER_URL", "https://habit-tracker-sandy-eight.vercel.app"
        ),
        habit_email=os.getenv("HABIT_EMAIL", "admin@habit.local"),
        habit_password=os.getenv("HABIT_PASSWORD", "admin123"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_model=os.getenv("OLLAMA_MODEL", "llama3.1:8b-instruct-q4_K_M"),
        session_cache_file=home / ".habitcoach_session",
        log_dir=log_dir,
    )
