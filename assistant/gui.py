import logging
import tkinter as tk
from datetime import datetime
from typing import Callable, Optional

from config import Config
from personality import build_system_prompt, _safe_score

log = logging.getLogger(__name__)

CATEGORIES = ["physical", "financial", "discipline", "focus", "mental", "appearance"]

TREND_SYMBOLS = {
    "improving": ("↑ improving", "trend_up"),
    "declining": ("↓ declining", "trend_dn"),
    "stable": ("→ stable", "trend_st"),
}


def _make_bar(score: float, width: int = 10) -> tuple[str, str]:
    filled = min(width, round((score / 10.0) * width))
    return "█" * filled, "░" * (width - filled)


def _score_tag(score: float) -> str:
    if score >= 7.0:
        return "score_hi"
    if score >= 4.0:
        return "score_mid"
    return "score_lo"


class CoachGUI:
    def __init__(self, root: tk.Tk, config: Config):
        self.root = root
        self.config = config
        self._data: dict = {}
        self._history: list[dict] = []
        self._current_response: str = ""
        self._is_streaming: bool = False
        self._ollama_available: bool = False
        self._stream_fn: Optional[Callable] = None  # set by app.py

        self._build_window()
        self._build_widgets()
        self._show_loading()

    # ── Window setup ───────────────────────────────────────────────────────────

    def _build_window(self):
        root = self.root
        root.overrideredirect(True)
        root.configure(bg=self.config.bg_color)
        root.attributes("-topmost", False)

        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        w = self.config.panel_width
        root.geometry(f"{w}x{sh}+{sw - w}+0")
        root.resizable(False, False)

        # macOS: keep window on all spaces and suppress title bar
        try:
            root.tk.call(
                "::tk::unsupported::MacWindowStyle", "style", root._w, "plain", "none"
            )
        except Exception:
            pass

    # ── Widgets ────────────────────────────────────────────────────────────────

    def _build_widgets(self):
        c = self.config
        root = self.root

        sh = root.winfo_screenheight()
        report_h = max(8, sh // 48)  # dynamic rows based on screen height

        # ── Title bar
        self._title_bar = tk.Frame(root, bg=c.header_bg, height=32)
        self._title_bar.pack(fill="x", side="top")
        self._title_bar.pack_propagate(False)

        tk.Label(
            self._title_bar,
            text="  HABIT COACH",
            bg=c.header_bg,
            fg=c.accent_color,
            font=(c.font_family, 10, "bold"),
            anchor="w",
        ).pack(side="left", padx=4)

        tk.Button(
            self._title_bar,
            text="×",
            bg=c.header_bg,
            fg=c.dim_color,
            font=(c.font_family, 14),
            borderwidth=0,
            highlightthickness=0,
            activebackground=c.header_bg,
            activeforeground=c.warn_color,
            command=root.destroy,
            cursor="hand2",
        ).pack(side="right", padx=8)

        self._title_bar.bind("<ButtonPress-1>", self._drag_start)
        self._title_bar.bind("<B1-Motion>", self._drag_motion)
        for child in self._title_bar.winfo_children():
            child.bind("<ButtonPress-1>", self._drag_start)
            child.bind("<B1-Motion>", self._drag_motion)

        # ── Report text (static data display)
        report_frame = tk.Frame(root, bg=c.bg_color)
        report_frame.pack(fill="x", side="top", padx=0, pady=0)

        self._report_text = tk.Text(
            report_frame,
            bg=c.bg_color,
            fg=c.fg_color,
            font=(c.font_family, 9),
            height=report_h,
            wrap="word",
            borderwidth=0,
            highlightthickness=0,
            state="disabled",
            cursor="arrow",
            padx=10,
            pady=6,
        )
        self._report_text.pack(fill="x")
        self._configure_report_tags()

        # Thin divider
        tk.Frame(root, bg="#1e1e1e", height=1).pack(fill="x")

        # ── Chat text (streaming AI output) — fills remaining space
        chat_frame = tk.Frame(root, bg=c.bg_color)
        chat_frame.pack(fill="both", expand=True, padx=0, pady=0)

        chat_scroll = tk.Scrollbar(chat_frame, bg=c.bg_color, troughcolor=c.bg_color,
                                   activebackground=c.dim_color, width=6)
        self._chat_text = tk.Text(
            chat_frame,
            bg=c.bg_color,
            fg=c.fg_color,
            font=(c.font_family, 9),
            wrap="word",
            borderwidth=0,
            highlightthickness=0,
            state="disabled",
            cursor="arrow",
            padx=10,
            pady=6,
            yscrollcommand=chat_scroll.set,
        )
        chat_scroll.config(command=self._chat_text.yview)
        chat_scroll.pack(side="right", fill="y")
        self._chat_text.pack(fill="both", expand=True)
        self._configure_chat_tags()

        # ── Status bar
        self._status_var = tk.StringVar(value="INITIALIZING...")
        status_bar = tk.Frame(root, bg="#0d0d0d", height=20)
        status_bar.pack(fill="x", side="bottom")
        status_bar.pack_propagate(False)
        tk.Label(
            status_bar,
            textvariable=self._status_var,
            bg="#0d0d0d",
            fg=c.dim_color,
            font=(c.font_family, 8),
            anchor="w",
        ).pack(side="left", padx=10)

        # ── Input area
        input_frame = tk.Frame(root, bg=c.header_bg, height=54)
        input_frame.pack(fill="x", side="bottom")
        input_frame.pack_propagate(False)

        self._input_entry = tk.Entry(
            input_frame,
            bg=c.input_bg,
            fg=c.fg_color,
            font=(c.font_family, 10),
            insertbackground=c.accent_color,
            borderwidth=0,
            highlightthickness=1,
            highlightcolor=c.dim_color,
            highlightbackground="#222222",
            relief="flat",
        )
        self._input_entry.pack(side="left", fill="both", expand=True, padx=(10, 4), pady=12)
        self._input_entry.bind("<Return>", lambda e: self._on_send())

        tk.Button(
            input_frame,
            text="→",
            bg=c.input_bg,
            fg=c.accent_color,
            font=(c.font_family, 13, "bold"),
            borderwidth=0,
            highlightthickness=0,
            activebackground=c.input_bg,
            activeforeground="#ffffff",
            command=self._on_send,
            cursor="hand2",
            width=3,
        ).pack(side="right", padx=(0, 10), pady=12)

    def _configure_report_tags(self):
        t = self._report_text
        c = self.config
        t.tag_configure("header", foreground=c.accent_color, font=(c.font_family, 9, "bold"))
        t.tag_configure("score_hi", foreground=c.accent_color)
        t.tag_configure("score_mid", foreground=c.mid_color)
        t.tag_configure("score_lo", foreground=c.warn_color)
        t.tag_configure("bar_fill_hi", foreground=c.accent_color)
        t.tag_configure("bar_fill_mid", foreground=c.mid_color)
        t.tag_configure("bar_fill_lo", foreground=c.warn_color)
        t.tag_configure("bar_empty", foreground=c.bar_color)
        t.tag_configure("trend_up", foreground=c.accent_color)
        t.tag_configure("trend_dn", foreground=c.warn_color)
        t.tag_configure("trend_st", foreground=c.dim_color)
        t.tag_configure("dim", foreground=c.dim_color)
        t.tag_configure("normal", foreground=c.fg_color)
        t.tag_configure("warn_label", foreground=c.warn_color, font=(c.font_family, 9, "bold"))

    def _configure_chat_tags(self):
        t = self._chat_text
        c = self.config
        t.tag_configure("coach_msg", foreground=c.fg_color)
        t.tag_configure("user_msg", foreground="#888888", font=(c.font_family, 9, "italic"))
        t.tag_configure("label_coach", foreground=c.accent_color, font=(c.font_family, 9, "bold"))
        t.tag_configure("label_user", foreground=c.dim_color, font=(c.font_family, 9, "bold"))
        t.tag_configure("error_msg", foreground=c.warn_color)
        t.tag_configure("warn_msg", foreground=c.mid_color)
        t.tag_configure("dim", foreground=c.dim_color)

    # ── Drag support ───────────────────────────────────────────────────────────

    def _drag_start(self, event):
        self._drag_x = event.x
        self._drag_y = event.y

    def _drag_motion(self, event):
        dx = event.x - self._drag_x
        dy = event.y - self._drag_y
        x = self.root.winfo_x() + dx
        y = self.root.winfo_y() + dy
        self.root.geometry(f"+{x}+{y}")

    # ── Loading / error states ─────────────────────────────────────────────────

    def _show_loading(self):
        self._report_insert("normal", "Loading habit data...\n")
        self._status_var.set("CONNECTING...")

    def show_error(self, message: str):
        self._chat_append(f"\n[ERROR] {message}\n", "error_msg")
        self._status_var.set("ERROR")

    def show_ollama_offline(self):
        self._chat_append(
            "\n[OLLAMA OFFLINE] AI coaching unavailable.\n"
            "Start Ollama and relaunch to enable analysis.\n",
            "warn_msg",
        )
        self._status_var.set("OFFLINE")

    # ── Report rendering ───────────────────────────────────────────────────────

    def render_report(self, data: dict):
        self._data = data
        analytics = data.get("analytics", {})
        habits = data.get("habits", [])

        scores_list = analytics.get("categoryScores", [])
        latest = scores_list[-1] if scores_list else {}

        def gs(key):
            return _safe_score(latest.get(key))

        avg_overall = (
            sum(_safe_score(s.get("overall")) for s in scores_list) / len(scores_list)
            if scores_list else 0.0
        )
        trends = analytics.get("trends", {})
        habit_stats = analytics.get("habitStats", []) or [
            {
                "name": h.get("name", "?"),
                "category": h.get("category", "?"),
                "completionRate": _safe_score(h.get("completionRate")),
                "streak": h.get("streak", 0),
            }
            for h in habits
        ]
        weakest = sorted(habit_stats, key=lambda h: _safe_score(h.get("completionRate")))[:3]
        proj = analytics.get("projectStats", {})

        t = self._report_text
        t.configure(state="normal")
        t.delete("1.0", "end")

        # Header
        date_str = datetime.now().strftime("%Y-%m-%d")
        t.insert("end", "HABIT INTELLIGENCE REPORT\n", "header")
        t.insert("end", f"{date_str}  ", "dim")
        t.insert("end", "━" * 22 + "\n\n", "dim")

        # Category scores
        t.insert("end", "CATEGORY SCORES\n", "header")
        t.insert("end", "─" * 36 + "\n", "dim")

        score_map = {cat: gs(cat) for cat in CATEGORIES}
        score_map["overall"] = gs("overall")

        for cat in CATEGORIES:
            score = score_map[cat]
            stag = _score_tag(score)
            bar_fill, bar_empty = _make_bar(score)
            bar_fill_tag = f"bar_fill_{stag.split('_')[1]}" if "_" in stag else "bar_fill_hi"
            trend_key = trends.get(cat, "stable")
            trend_text, trend_tag = TREND_SYMBOLS.get(trend_key, ("→ stable", "trend_st"))
            label = cat.capitalize().ljust(11)

            # Mark weak scores
            if score < 5.0:
                t.insert("end", label, "warn_label")
            else:
                t.insert("end", label, "dim")

            t.insert("end", f"{score:4.1f}  [", "dim")
            t.insert("end", bar_fill, bar_fill_tag)
            t.insert("end", bar_empty, "bar_empty")
            t.insert("end", "]  ", "dim")
            t.insert("end", trend_text + "\n", trend_tag)

        t.insert("end", "─" * 36 + "\n", "dim")
        overall = score_map["overall"]
        bar_fill, bar_empty = _make_bar(overall)
        stag = _score_tag(overall)
        bar_fill_tag = f"bar_fill_{stag.split('_')[1]}" if "_" in stag else "bar_fill_hi"
        t.insert("end", "Overall    ", "dim")
        t.insert("end", f"{overall:4.1f}  [", "dim")
        t.insert("end", bar_fill, bar_fill_tag)
        t.insert("end", bar_empty, "bar_empty")
        t.insert("end", "]\n", "dim")
        t.insert("end", f"30-DAY AVG: {avg_overall:.1f} / 10.0\n\n", "score_mid")

        # Weakest habits
        if weakest:
            t.insert("end", "WEAKEST HABITS\n", "header")
            t.insert("end", "─" * 36 + "\n", "dim")
            for h in weakest:
                rate = round(_safe_score(h.get("completionRate")) * 100)
                streak = h.get("streak", 0)
                name = h.get("name", "?")
                cat = h.get("category", "?")
                t.insert("end", f"→ ", "dim")
                t.insert("end", f"{name}", "score_lo" if rate < 50 else "score_mid")
                t.insert("end", f" ({cat}): {rate}% · {streak}d streak\n", "dim")
            t.insert("end", "\n", "dim")

        # Projects
        t.insert("end", f"PROJECTS  ", "header")
        t.insert("end", f"Active:{proj.get('active',0)}  "
                        f"Overdue:{proj.get('overdueCount',0)}  "
                        f"Done/wk:{proj.get('completedThisWeek',0)}\n", "dim")
        t.insert("end", "━" * 36 + "\n", "dim")
        t.insert("end", "AI ANALYSIS ↓\n", "header")
        t.insert("end", "━" * 36 + "\n", "dim")
        t.configure(state="disabled")

        self._status_var.set("READY")

    # ── Chat helpers ───────────────────────────────────────────────────────────

    def _chat_append(self, text: str, tag: str = "coach_msg"):
        t = self._chat_text
        t.configure(state="normal")
        t.insert("end", text, tag)
        t.see("end")
        t.configure(state="disabled")

    def _report_insert(self, tag: str, text: str):
        t = self._report_text
        t.configure(state="normal")
        t.insert("end", text, tag)
        t.configure(state="disabled")

    def _append_streaming_token(self, token: str):
        self._current_response += token
        self._chat_append(token, "coach_msg")

    # ── Send / stream logic ────────────────────────────────────────────────────

    def _on_send(self):
        text = self._input_entry.get().strip()
        if not text or self._is_streaming or not self._ollama_available:
            return
        self._input_entry.delete(0, "end")
        self._chat_append(f"\nYou: {text}\n", "user_msg")
        self._chat_append("Coach: ", "label_coach")
        self._history.append({"role": "user", "content": text})
        self._stream_response()

    def _stream_response(self, override_user_message: Optional[str] = None):
        if not self._stream_fn or not self._ollama_available:
            return
        if self._is_streaming:
            return

        if override_user_message:
            messages = [
                {"role": "system", "content": build_system_prompt(self._data)},
                {"role": "user", "content": override_user_message},
            ]
        else:
            # Trim history to last 20 turns
            history = self._history[-20:]
            messages = [
                {"role": "system", "content": build_system_prompt(self._data)},
                *history,
            ]

        self._is_streaming = True
        self._current_response = ""
        self._status_var.set("TYPING...")

        def on_token(token: str):
            self.root.after(0, self._append_streaming_token, token)

        def on_done():
            def _finish():
                if self._current_response:
                    self._history.append(
                        {"role": "assistant", "content": self._current_response}
                    )
                self._current_response = ""
                self._is_streaming = False
                self._status_var.set("READY")
                self._chat_append("\n", "dim")
            self.root.after(0, _finish)

        def on_error(exc: Exception):
            def _show():
                self._is_streaming = False
                self._status_var.set("ERROR")
                self._chat_append(f"\n[STREAM ERROR] {exc}\n", "error_msg")
            self.root.after(0, _show)

        self._stream_fn(messages, on_token, on_done, on_error)

    def trigger_initial_analysis(self):
        self._chat_append("\nCoach: ", "label_coach")
        self._stream_response(
            override_user_message=(
                "Give me your full read of my performance. "
                "Be direct. Start with the most critical problem."
            )
        )
