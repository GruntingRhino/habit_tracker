import json
import logging
import threading
from typing import Callable, Optional

import requests

from config import Config

log = logging.getLogger(__name__)


class OllamaError(Exception):
    pass


class OllamaClient:
    def __init__(self, config: Config):
        self.config = config

    def check_availability(self) -> bool:
        try:
            resp = requests.get(
                f"{self.config.ollama_base_url}/api/tags", timeout=3
            )
            return resp.ok
        except Exception:
            return False

    def stream_chat(
        self,
        messages: list,
        on_token: Callable[[str], None],
        on_done: Optional[Callable[[], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
    ) -> None:
        """Launch streaming in a daemon thread. Calls on_token for each token."""
        thread = threading.Thread(
            target=self._stream_worker,
            args=(messages, on_token, on_done, on_error),
            daemon=True,
        )
        thread.start()

    def _stream_worker(
        self,
        messages: list,
        on_token: Callable[[str], None],
        on_done: Optional[Callable[[], None]],
        on_error: Optional[Callable[[Exception], None]],
    ):
        url = f"{self.config.ollama_base_url}/api/chat"
        payload = {
            "model": self.config.ollama_model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": 0.75,
                "num_predict": 400,
            },
        }
        try:
            with requests.post(url, json=payload, stream=True, timeout=120) as resp:
                if not resp.ok:
                    body = resp.text[:200]
                    raise OllamaError(f"HTTP {resp.status_code}: {body}")
                for raw_line in resp.iter_lines():
                    if not raw_line:
                        continue
                    try:
                        obj = json.loads(raw_line)
                    except json.JSONDecodeError:
                        continue
                    token = obj.get("message", {}).get("content", "")
                    if token:
                        on_token(token)
                    if obj.get("done"):
                        break
            if on_done:
                on_done()
        except Exception as e:
            log.error("Ollama stream error: %s", e)
            if on_error:
                on_error(e)
