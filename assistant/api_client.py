import json
import logging
import os
import time
from typing import Union
from urllib.parse import urlparse

import requests

from config import Config

log = logging.getLogger(__name__)


class APIUnreachableError(Exception):
    pass


class APIAuthError(Exception):
    pass


class APIError(Exception):
    def __init__(self, status_code: int, message: str = ""):
        super().__init__(message or f"HTTP {status_code}")
        self.status_code = status_code


class HabitTrackerClient:
    def __init__(self, config: Config):
        self.config = config
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "HabitCoach/1.0"})
        self._cookie_value: str | None = None

    # ── Session cache ──────────────────────────────────────────────────────────

    def _load_cached_session(self) -> bool:
        """Return True if a valid cached session was loaded."""
        path = self.config.session_cache_file
        if not path.exists():
            return False
        try:
            data = json.loads(path.read_text())
            if data.get("expires", 0) > time.time():
                self._cookie_value = data["cookie"]
                self._inject_cookie(data["cookie"])
                log.info("Loaded cached session (expires in %.0fh)",
                         (data["expires"] - time.time()) / 3600)
                return True
        except Exception as e:
            log.warning("Failed to load cached session: %s", e)
        return False

    def _save_session(self, cookie_value: str):
        path = self.config.session_cache_file
        data = {
            "cookie": cookie_value,
            "expires": time.time() + 82800,  # 23 hours
        }
        path.write_text(json.dumps(data))
        # Restrict permissions on Unix
        try:
            os.chmod(path, 0o600)
        except Exception:
            pass

    def _clear_session(self):
        path = self.config.session_cache_file
        if path.exists():
            path.unlink()
        self._cookie_value = None
        self._session.cookies.clear()

    def _inject_cookie(self, cookie_value: str):
        domain = urlparse(self.config.habit_tracker_url).hostname or ""
        self._session.cookies.set(
            "next-auth.session-token", cookie_value, domain=domain
        )

    # ── Authentication ─────────────────────────────────────────────────────────

    def _authenticate(self):
        base = self.config.habit_tracker_url
        log.info("Authenticating with %s", base)
        try:
            # Step 1: get CSRF token
            csrf_resp = self._session.get(f"{base}/api/auth/csrf", timeout=15)
            csrf_resp.raise_for_status()
            csrf_token = csrf_resp.json()["csrfToken"]

            # Step 2: sign in
            signin_resp = self._session.post(
                f"{base}/api/auth/signin/credentials",
                data={
                    "csrfToken": csrf_token,
                    "email": self.config.habit_email,
                    "password": self.config.habit_password,
                    "callbackUrl": "/",
                    "json": "true",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15,
                allow_redirects=False,
            )

            # Extract session cookie from Set-Cookie or from the session jar
            cookie_value = None
            for name, value in self._session.cookies.items():
                if "session-token" in name:
                    cookie_value = value
                    break

            # Also check response headers directly
            if not cookie_value:
                set_cookie = signin_resp.headers.get("Set-Cookie", "")
                for part in set_cookie.split(";"):
                    part = part.strip()
                    if "session-token=" in part:
                        cookie_value = part.split("=", 1)[1]
                        break

            if not cookie_value:
                # Try following the redirect — NextAuth sometimes redirects
                if signin_resp.status_code in (302, 303):
                    follow = self._session.get(
                        f"{base}{signin_resp.headers.get('Location', '/')}",
                        timeout=15,
                    )
                    for name, value in self._session.cookies.items():
                        if "session-token" in name:
                            cookie_value = value
                            break

            if not cookie_value:
                raise APIAuthError("No session token received after login")

            self._cookie_value = cookie_value
            self._save_session(cookie_value)
            log.info("Authentication successful")

        except requests.exceptions.ConnectionError as e:
            raise APIUnreachableError(str(e)) from e
        except APIAuthError:
            raise
        except Exception as e:
            raise APIError(0, str(e)) from e

    def ensure_authenticated(self):
        if not self._load_cached_session():
            self._authenticate()

    # ── API calls ──────────────────────────────────────────────────────────────

    def _get(self, path: str, retry: bool = True) -> Union[dict, list]:
        url = f"{self.config.habit_tracker_url}{path}"
        try:
            resp = self._session.get(url, timeout=20)
        except requests.exceptions.ConnectionError as e:
            raise APIUnreachableError(str(e)) from e

        if resp.status_code == 401 and retry:
            log.warning("Got 401, clearing cache and re-authenticating")
            self._clear_session()
            self._authenticate()
            return self._get(path, retry=False)

        if not resp.ok:
            raise APIError(resp.status_code, f"GET {path} → {resp.status_code}")

        return resp.json()

    def fetch_analytics(self) -> dict:
        return self._get("/api/analytics")

    def fetch_habits(self) -> list:
        return self._get("/api/habits")

    def fetch_daily_entries(self) -> list:
        return self._get("/api/daily-entries")

    def fetch_all(self) -> dict:
        analytics = self.fetch_analytics()
        habits = self.fetch_habits()
        daily_entries = self.fetch_daily_entries()
        return {
            "analytics": analytics,
            "habits": habits,
            "daily_entries": daily_entries,
        }
