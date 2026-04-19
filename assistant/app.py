#!/usr/bin/env python3
"""Habit Coach — personal performance assistant.

Launches a borderless side-panel GUI that fetches data from the habit tracker,
renders a score report, and streams aggressive AI coaching via Ollama.
"""

import logging
import pathlib
import sys
import threading
import tkinter as tk

# Ensure the assistant directory is in the path when invoked from other locations
_HERE = pathlib.Path(__file__).parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from config import load_config
from api_client import HabitTrackerClient, APIUnreachableError, APIAuthError, APIError
from ollama_client import OllamaClient
from gui import CoachGUI


def setup_logging(log_dir: pathlib.Path):
    log_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(log_dir / "app.log"),
            logging.StreamHandler(sys.stderr),
        ],
    )


def main():
    config = load_config()
    setup_logging(config.log_dir)
    log = logging.getLogger("app")
    log.info("Starting Habit Coach")

    # Build window immediately so user sees it right away
    root = tk.Tk()
    gui = CoachGUI(root, config)

    api = HabitTrackerClient(config)
    ollama = OllamaClient(config)

    # Wire up the stream function so gui can call ollama
    gui._stream_fn = ollama.stream_chat

    def background_startup():
        # 1. Authenticate + fetch data
        try:
            api.ensure_authenticated()
            data = api.fetch_all()
        except APIUnreachableError as e:
            log.error("API unreachable: %s", e)
            root.after(0, gui.show_error,
                       f"Cannot reach habit tracker.\nCheck internet connection.\n({e})")
            return
        except APIAuthError as e:
            log.error("Auth failed: %s", e)
            root.after(0, gui.show_error,
                       f"Authentication failed. Check credentials in .env\n({e})")
            return
        except APIError as e:
            log.error("API error: %s", e)
            root.after(0, gui.show_error, str(e))
            return
        except Exception as e:
            log.exception("Unexpected error fetching data")
            root.after(0, gui.show_error, str(e))
            return

        # 2. Render static report on main thread
        root.after(0, gui.render_report, data)

        # 3. Check Ollama and trigger initial analysis
        if ollama.check_availability():
            gui._ollama_available = True
            root.after(100, gui.trigger_initial_analysis)
        else:
            log.warning("Ollama not available")
            root.after(0, gui.show_ollama_offline)

    t = threading.Thread(target=background_startup, daemon=True)
    t.start()

    root.mainloop()


if __name__ == "__main__":
    main()
