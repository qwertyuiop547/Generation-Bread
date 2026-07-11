"""Monthly attendance calendar: present / late / absent per day."""
import calendar
from datetime import date, datetime, timedelta

from django.conf import settings
from django.utils import timezone


def _local_tz():
    from zoneinfo import ZoneInfo
    return ZoneInfo(settings.TIME_ZONE)


def attendance_absent_today_flags(user, today_shift, now, shift_start_override=None, shift_end_override=None):
    """Compare scheduled shift start vs clock-in; flag absent after grace if still unclocked."""
    grace_minutes = getattr(settings, 'ATTENDANCE_GRACE_MINUTES', 15)
    local_tz = _local_tz()
    local_now = now.astimezone(local_tz)
    effective_start = shift_start_override or user.shift_start

    if not effective_start:
        return {
            'is_scheduled': False,
            'within_grace': False,
            'absent_today': False,
            'grace_deadline': None,
        }

    scheduled_start = datetime.combine(local_now.date(), effective_start, tzinfo=local_tz)
    grace_deadline = scheduled_start + timedelta(minutes=grace_minutes)

    has_valid_clock_in = (
        today_shift is not None
        and today_shift.clock_in is not None
        and today_shift.attendance_mark != 'absent'
    )

    if has_valid_clock_in:
        return {
            'is_scheduled': True,
            'within_grace': False,
            'absent_today': False,
            'grace_deadline': grace_deadline.isoformat(),
        }

    if local_now < scheduled_start:
        return {
            'is_scheduled': True,
            'within_grace': True,
            'absent_today': False,
            'grace_deadline': grace_deadline.isoformat(),
        }

    if local_now <= grace_deadline:
        return {
            'is_scheduled': True,
            'within_grace': True,
            'absent_today': False,
            'grace_deadline': grace_deadline.isoformat(),
        }

    return {
        'is_scheduled': True,
        'within_grace': False,
        'absent_today': True,
        'grace_deadline': grace_deadline.isoformat(),
    }


def _day_shift_map(staff_user, month_start, month_end):
    from .models import ShiftLog

    shifts = ShiftLog.objects.filter(
        user=staff_user,
        clock_in__date__gte=month_start,
        clock_in__date__lte=month_end,
    ).order_by('clock_in')

    by_date = {}
    for shift in shifts:
        day = shift.clock_in.astimezone(_local_tz()).date()
        existing = by_date.get(day)
        if existing is None:
            by_date[day] = shift
            continue
        # Keep worst status for the day (absent > late > others)
        priority = {'absent': 3, 'late': 2}
        existing_p = priority.get(existing.attendance_mark, 0)
        new_p = priority.get(shift.attendance_mark, 0)
        if new_p > existing_p:
            by_date[day] = shift
    return by_date


def _historical_absent(staff_user, day_date, shift, day_assignment=None):
    """Past scheduled day with no valid clock-in."""
    if shift is not None:
        return False
    if day_assignment is not None:
        return True
    if not staff_user.shift_start:
        return False
    join_date = staff_user.date_joined.date() if staff_user.date_joined else None
    if join_date and day_date < join_date:
        return False
    return False


def _today_status(staff_user, shift, now, day_assignment=None):
    """Status for today before month-end classification."""
    if shift:
        if shift.attendance_mark == 'absent':
            return 'absent'
        if shift.attendance_mark == 'late' or (shift.minutes_late and shift.minutes_late > 0):
            return 'late'
        if shift.attendance_mark == 'on_time' or shift.is_approved:
            return 'present'
        if shift.clock_in:
            return 'pending'
    start_override = day_assignment.start_time if day_assignment else None
    end_override = day_assignment.end_time if day_assignment else None
    flags = attendance_absent_today_flags(
        staff_user, shift, now,
        shift_start_override=start_override,
        shift_end_override=end_override,
    )
    if flags.get('absent_today'):
        return 'absent'
    if day_assignment and not shift:
        return 'no_record'
    return 'no_record'


def _day_assignment_map(staff_user, month_start, month_end):
    from .models import ShiftAssignment
    assignments = ShiftAssignment.objects.filter(
        user=staff_user,
        shift_date__gte=month_start,
        shift_date__lte=month_end,
    )
    return {a.shift_date: a for a in assignments}


def _assignment_payload(assignment):
    if not assignment:
        return None
    return {
        'id': assignment.id,
        'start_time': assignment.start_time.isoformat(),
        'end_time': assignment.end_time.isoformat(),
        'station': assignment.station,
        'station_display': assignment.get_station_display(),
    }


def _day_absence_map(staff_user, month_start, month_end):
    from .models import AbsenceRequest
    requests = AbsenceRequest.objects.filter(
        user=staff_user,
        absence_date__gte=month_start,
        absence_date__lte=month_end,
        status='approved',
    )
    return {r.absence_date: r for r in requests}


def _absence_payload(request):
    if not request:
        return None
    created_by = request.created_by
    return {
        'id': request.id,
        'reason': request.reason,
        'absence_date': request.absence_date.isoformat(),
        'created_by_name': (
            created_by.first_name or created_by.email.split('@')[0]
            if created_by else None
        ),
    }


def _classify_shift_day(staff_user, day_date, shift, now, absence_request=None, day_assignment=None):
    if absence_request:
        return 'planned_absent'

    local_now = now.astimezone(_local_tz())
    today = local_now.date()

    if day_date > today:
        return 'future'

    join_date = staff_user.date_joined.date() if staff_user.date_joined else None
    if join_date and day_date < join_date:
        return 'no_record'

    if day_date == today:
        return _today_status(staff_user, shift, now, day_assignment)

    if shift:
        if shift.attendance_mark == 'absent':
            return 'absent'
        if shift.attendance_mark == 'late' or (shift.minutes_late and shift.minutes_late > 0):
            return 'late'
        if shift.attendance_mark == 'on_time' or shift.is_approved or shift.clock_in:
            return 'present'
        return 'pending'

    if _historical_absent(staff_user, day_date, shift, day_assignment):
        return 'absent'

    return 'no_record'


def _shift_payload(shift):
    if not shift:
        return None
    return {
        'shift_id': shift.id,
        'clock_in': shift.clock_in.isoformat() if shift.clock_in else None,
        'clock_out': shift.clock_out.isoformat() if shift.clock_out else None,
        'break_start': shift.break_start.isoformat() if shift.break_start else None,
        'break_end': shift.break_end.isoformat() if shift.break_end else None,
        'minutes_late': shift.minutes_late,
        'attendance_mark': shift.attendance_mark,
        'is_approved': shift.is_approved,
    }


def build_monthly_calendar(staff_user, year=None, month=None, now=None):
    now = now or timezone.now()
    local_now = now.astimezone(_local_tz())
    year = year or local_now.year
    month = month or local_now.month

    month_start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    month_end = date(year, month, last_day)

    shift_map = _day_shift_map(staff_user, month_start, month_end)
    absence_map = _day_absence_map(staff_user, month_start, month_end)
    assignment_map = _day_assignment_map(staff_user, month_start, month_end)

    # Monday-first calendar grid (0 = Mon … 6 = Sun)
    first_weekday = month_start.weekday()
    days_in_month = last_day

    days = []
    counts = {
        'present': 0, 'late': 0, 'absent': 0, 'planned_absent': 0,
        'pending': 0, 'no_record': 0, 'future': 0,
    }

    for day_num in range(1, days_in_month + 1):
        day_date = date(year, month, day_num)
        shift = shift_map.get(day_date)
        absence_request = absence_map.get(day_date)
        day_assignment = assignment_map.get(day_date)
        status = _classify_shift_day(
            staff_user, day_date, shift, now, absence_request, day_assignment,
        )
        counts[status] = counts.get(status, 0) + 1

        days.append({
            'date': day_date.isoformat(),
            'day': day_num,
            'weekday': day_date.weekday(),
            'weekday_label': day_date.strftime('%a'),
            'status': status,
            'shift': _shift_payload(shift),
            'absence_request': _absence_payload(absence_request),
            'shift_assignment': _assignment_payload(day_assignment),
        })

    scheduled_days = (
        counts['present'] + counts['late'] + counts['absent']
        + counts['pending'] + counts['planned_absent']
    )
    attendance_rate = round(
        (counts['present'] + counts['late']) / scheduled_days * 100, 1
    ) if scheduled_days else 0.0

    return {
        'year': year,
        'month': month,
        'month_label': month_start.strftime('%B %Y'),
        'calendar_start_offset': first_weekday,
        'days_in_month': days_in_month,
        'weekday_headers': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        'days': days,
        'summary': {
            'present': counts['present'],
            'late': counts['late'],
            'absent': counts['absent'],
            'planned_absent': counts['planned_absent'],
            'pending': counts['pending'],
            'no_record': counts['no_record'],
            'future': counts['future'],
            'scheduled_days': scheduled_days,
            'attendance_rate': attendance_rate,
        },
    }
