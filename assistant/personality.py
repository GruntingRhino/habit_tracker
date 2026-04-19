from datetime import datetime


RAT_RACE_TRIGGER = (
    "Do you want to be stuck in a Rat Race? "
    "Do you want to be stuck living a poor paycheck to paycheck life?"
)

_SYSTEM_TEMPLATE = """\
You are COACH — a brutal, unfiltered personal performance coach operating inside \
a private habit tracking terminal. You have zero tolerance for excuses, mediocrity, \
or self-pity. You are not a therapist. You are not a friend. You are the iron voice \
inside the user's head that refuses to let complacency win.

RULES:
1. Always reference exact numbers from the data. Never speak in vague generalities.
2. Keep responses under 200 words unless the user explicitly asks for more detail.
3. Use short, punchy sentences. No bullet points in conversational responses.
4. Never use emojis.
5. When ANY category score is below 5.0 out of 10, you MUST include the following \
sentence verbatim before your personalized line:
   "{rat_race}"
   Then immediately follow with ONE cutting, specific line referencing exactly \
which score is the lowest and what it is costing them in their future.
6. After every compliment or positive observation, immediately demand more.
7. Be surgical. Be specific. Be relentless.

TODAY'S DATE: {date}

CURRENT CATEGORY SCORES (0–10 scale):
  Physical:    {physical}
  Financial:   {financial}
  Discipline:  {discipline}
  Focus:       {focus}
  Mental:      {mental}
  Appearance:  {appearance}
  Overall:     {overall}

30-DAY TRENDS (improving / stable / declining):
  Physical:    {trend_physical}
  Financial:   {trend_financial}
  Discipline:  {trend_discipline}
  Focus:       {trend_focus}
  Mental:      {trend_mental}
  Appearance:  {trend_appearance}

WEAKEST HABITS (lowest 30-day completion rate):
{weakest_habits}

PROJECT STATUS:
  Active: {proj_active}  |  Overdue: {proj_overdue}  |  Done this week: {proj_week}

30-DAY OVERALL AVERAGE: {avg_overall}/10.0
"""


def _safe_score(val, default=0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def build_system_prompt(data: dict) -> str:
    analytics = data.get("analytics", {})
    habits = data.get("habits", [])

    # Latest scores
    scores_list = analytics.get("categoryScores", [])
    latest = scores_list[-1] if scores_list else {}
    physical = _safe_score(latest.get("physical"))
    financial = _safe_score(latest.get("financial"))
    discipline = _safe_score(latest.get("discipline"))
    focus = _safe_score(latest.get("focus"))
    mental = _safe_score(latest.get("mental"))
    appearance = _safe_score(latest.get("appearance"))
    overall = _safe_score(latest.get("overall"))

    # 30-day overall average
    if scores_list:
        avg_overall = sum(_safe_score(s.get("overall")) for s in scores_list) / len(scores_list)
    else:
        avg_overall = 0.0

    # Trends
    trends = analytics.get("trends", {})

    def trend_str(key: str) -> str:
        val = trends.get(key, "unknown")
        symbols = {"improving": "↑ improving", "declining": "↓ declining", "stable": "→ stable"}
        return symbols.get(val, val)

    # Weakest habits — use analytics habitStats if available, fall back to habits list
    habit_stats = analytics.get("habitStats", [])
    if not habit_stats:
        habit_stats = [
            {
                "name": h.get("name", "?"),
                "category": h.get("category", "?"),
                "completionRate": _safe_score(h.get("completionRate")),
                "streak": h.get("streak", 0),
            }
            for h in habits
        ]
    sorted_habits = sorted(habit_stats, key=lambda h: _safe_score(h.get("completionRate")))
    weakest = sorted_habits[:3]
    weakest_lines = "\n".join(
        f"  - {h.get('name','?')} ({h.get('category','?')}): "
        f"{round(_safe_score(h.get('completionRate')) * 100)}% completion, "
        f"{h.get('streak', 0)}d streak"
        for h in weakest
    ) or "  (no habit data)"

    # Projects
    proj = analytics.get("projectStats", {})
    proj_active = proj.get("active", 0)
    proj_overdue = proj.get("overdueCount", 0)
    proj_week = proj.get("completedThisWeek", 0)

    return _SYSTEM_TEMPLATE.format(
        rat_race=RAT_RACE_TRIGGER,
        date=datetime.now().strftime("%Y-%m-%d"),
        physical=f"{physical:.1f}",
        financial=f"{financial:.1f}",
        discipline=f"{discipline:.1f}",
        focus=f"{focus:.1f}",
        mental=f"{mental:.1f}",
        appearance=f"{appearance:.1f}",
        overall=f"{overall:.1f}",
        trend_physical=trend_str("physical"),
        trend_financial=trend_str("financial"),
        trend_discipline=trend_str("discipline"),
        trend_focus=trend_str("focus"),
        trend_mental=trend_str("mental"),
        trend_appearance=trend_str("appearance"),
        weakest_habits=weakest_lines,
        proj_active=proj_active,
        proj_overdue=proj_overdue,
        proj_week=proj_week,
        avg_overall=f"{avg_overall:.1f}",
    )
