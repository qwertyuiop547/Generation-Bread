"""Shared shift duration and overtime calculations (local timezone)."""
from collections import defaultdict
from datetime import datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone


def local_tz():
    from zoneinfo import ZoneInfo
    return ZoneInfo(settings.TIME_ZONE)


def current_week_bounds(now=None):
    """Monday 00:00 through next Monday 00:00 in local time."""
    local = local_tz()
    now = (now or timezone.now()).astimezone(local)
    week_start_date = now.date() - timedelta(days=now.weekday())
    week_start = datetime.combine(week_start_date, datetime.min.time(), tzinfo=local)
    week_end = week_start + timedelta(days=7)
    return week_start, week_end, week_start_date


def week_start_for_date(day_date):
    """Monday of the week containing day_date."""
    return day_date - timedelta(days=day_date.weekday())


def format_hours_display(total_seconds):
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    if hours and minutes:
        return f"{hours}h {minutes}m"
    if hours:
        return f"{hours}h"
    return f"{minutes}m"


def shift_seconds_by_day(shift, now=None):
    """Worked seconds per local calendar day for one shift (break time excluded)."""
    if getattr(shift, 'attendance_mark', None) == 'absent' or not shift.clock_in:
        return {}

    local = local_tz()
    now = (now or timezone.now()).astimezone(local)
    start = shift.clock_in.astimezone(local)
    end = (shift.clock_out or timezone.now()).astimezone(local)
    if end <= start:
        return {}

    break_start = break_end = None
    if shift.break_start:
        break_start = shift.break_start.astimezone(local)
        if shift.break_end:
            break_end = shift.break_end.astimezone(local)
        elif not shift.clock_out:
            break_end = now
        else:
            break_end = now

    result = defaultdict(int)
    cursor = start
    while cursor < end:
        day_end = datetime.combine(
            cursor.date() + timedelta(days=1),
            datetime.min.time(),
            tzinfo=local,
        )
        segment_end = min(end, day_end)
        seg_seconds = int((segment_end - cursor).total_seconds())

        if break_start and break_end and break_end > break_start:
            overlap_start = max(cursor, break_start)
            overlap_end = min(segment_end, break_end)
            if overlap_end > overlap_start:
                seg_seconds -= int((overlap_end - overlap_start).total_seconds())

        if seg_seconds > 0:
            result[cursor.date()] += seg_seconds
        cursor = segment_end

    return dict(result)


def week_shifts_queryset(user, week_start, week_end):
    from .models import ShiftLog
    return ShiftLog.objects.filter(
        user=user,
        clock_in__lt=week_end,
    ).filter(
        Q(clock_out__gte=week_start) | Q(clock_out__isnull=True),
    ).exclude(attendance_mark='absent').order_by('clock_in')


def compute_user_week_payroll(user, now=None, standard_daily_hours=None, multiplier=None):
    """Regular + overtime hours for current week; OT = anything beyond 8h per day."""
    standard_daily_hours = standard_daily_hours or getattr(
        settings, 'STANDARD_DAILY_HOURS', 8,
    )
    multiplier = multiplier if multiplier is not None else getattr(
        settings, 'OVERTIME_MULTIPLIER', 1.25,
    )
    standard_daily_seconds = int(standard_daily_hours * 3600)

    now = now or timezone.now()
    week_start, week_end, week_start_date = current_week_bounds(now)
    week_end_date = week_start_date + timedelta(days=6)

    shifts = week_shifts_queryset(user, week_start, week_end)
    daily_totals = defaultdict(int)
    includes_active_shift = False
    shift_count = 0

    for shift in shifts:
        shift_count += 1
        if shift.clock_out is None:
            includes_active_shift = True
        for day, secs in shift_seconds_by_day(shift, now).items():
            if week_start_date <= day <= week_end_date:
                daily_totals[day] += secs

    regular_seconds = 0
    overtime_seconds = 0
    daily_breakdown = []
    overtime_days = 0

    for i in range(7):
        day = week_start_date + timedelta(days=i)
        day_sec = daily_totals.get(day, 0)
        day_regular = min(day_sec, standard_daily_seconds)
        day_ot = max(0, day_sec - standard_daily_seconds)
        regular_seconds += day_regular
        overtime_seconds += day_ot
        if day_ot > 0:
            overtime_days += 1
        if day_sec > 0:
            daily_breakdown.append({
                'date': day.isoformat(),
                'total_seconds': day_sec,
                'total_display': format_hours_display(day_sec),
                'regular_seconds': day_regular,
                'regular_display': format_hours_display(day_regular),
                'overtime_seconds': day_ot,
                'overtime_display': format_hours_display(day_ot) if day_ot else '0m',
                'has_overtime': day_ot > 0,
            })

    total_seconds = regular_seconds + overtime_seconds
    ot_hours = overtime_seconds / 3600
    weighted_ot_hours = round(ot_hours * float(multiplier), 2)

    return {
        'total_seconds': total_seconds,
        'total_hours': round(total_seconds / 3600, 2),
        'total_display': format_hours_display(total_seconds),
        'regular_seconds': regular_seconds,
        'regular_hours': round(regular_seconds / 3600, 2),
        'regular_display': format_hours_display(regular_seconds),
        'overtime_seconds': overtime_seconds,
        'overtime_hours': round(ot_hours, 2),
        'overtime_display': format_hours_display(overtime_seconds),
        'overtime_multiplier': float(multiplier),
        'weighted_overtime_hours': weighted_ot_hours,
        'weighted_overtime_display': f"{weighted_ot_hours}h",
        'overtime_days': overtime_days,
        'week_start': week_start_date.isoformat(),
        'week_end': week_end_date.isoformat(),
        'shift_count': shift_count,
        'includes_active_shift': includes_active_shift,
        'standard_daily_hours': standard_daily_hours,
        'daily_breakdown': daily_breakdown,
    }
