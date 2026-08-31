import calendar
from datetime import date

from .defaults import REPEAT_COUNT


def add_interval(d: date, repeat: str, n: int) -> date:
    """Advance a date by n repeat-intervals. Mirrors the frontend's JS Date
    rollover behavior for month/day overflow (e.g. Jan 31 + 1 month -> Mar 3,
    same as JS's Date.setMonth), so both apps behave identically."""
    if repeat == "weekly":
        from datetime import timedelta
        return d + timedelta(days=7 * n)
    if repeat == "monthly":
        month_index = d.month - 1 + n
        year = d.year + month_index // 12
        month = month_index % 12 + 1
        last_day = calendar.monthrange(year, month)[1]
        day = min(d.day, last_day)
        return date(year, month, day)
    if repeat == "yearly":
        try:
            return d.replace(year=d.year + n)
        except ValueError:
            return d.replace(year=d.year + n, day=28)
    return d


def build_recurring_dates(start: date, repeat: str):
    count = REPEAT_COUNT.get(repeat, 1)
    return [add_interval(start, repeat, i) for i in range(count)]
