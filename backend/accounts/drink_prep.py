"""Average drink prep time: Preparing → Ready per order, grouped by barista."""
from datetime import timedelta
from statistics import median

from django.utils import timezone


def format_duration_seconds(total_seconds):
    total_seconds = int(round(total_seconds))
    if total_seconds < 0:
        return '0s'
    minutes, seconds = divmod(total_seconds, 60)
    if minutes <= 0:
        return f'{seconds}s'
    if minutes < 60:
        return f'{minutes}m {seconds}s'
    hours, minutes = divmod(minutes, 60)
    return f'{hours}h {minutes}m'


def build_drink_prep_report(days=30, baristas_only=True, max_prep_minutes=120):
    from .models import CustomUser, OrderStatusLog

    now = timezone.now()
    since = now - timedelta(days=days)
    position_labels = dict(CustomUser.POSITION_CHOICES)

    ready_logs = (
        OrderStatusLog.objects.filter(
            status='ready',
            created_at__gte=since,
            changed_by__isnull=False,
        )
        .select_related('order', 'changed_by')
        .prefetch_related('order__items')
        .order_by('created_at')
    )

    order_ids = list({log.order_id for log in ready_logs})
    preparing_logs = OrderStatusLog.objects.filter(
        order_id__in=order_ids,
        status='preparing',
    ).order_by('order_id', 'created_at')

    preparing_by_order = {}
    for log in preparing_logs:
        preparing_by_order.setdefault(log.order_id, []).append(log)

    measured_orders = []
    max_seconds = max_prep_minutes * 60

    for ready_log in ready_logs:
        candidates = preparing_by_order.get(ready_log.order_id, [])
        preparing_log = None
        for candidate in reversed(candidates):
            if candidate.created_at <= ready_log.created_at:
                preparing_log = candidate
                break
        if not preparing_log:
            continue

        prep_seconds = (ready_log.created_at - preparing_log.created_at).total_seconds()
        if prep_seconds <= 0 or prep_seconds > max_seconds:
            continue

        barista = ready_log.changed_by
        if baristas_only and barista.position != 'barista':
            continue

        order = ready_log.order
        item_count = order.items.count() if hasattr(order, 'items') else 0

        measured_orders.append({
            'order_id': order.id,
            'order_label': f'ORD-{order.id:04d}',
            'barista_id': barista.id,
            'barista_name': barista.first_name or barista.email.split('@')[0],
            'barista_email': barista.email,
            'employee_id': barista.employee_id,
            'position': barista.position,
            'position_display': position_labels.get(barista.position, barista.position or 'Staff'),
            'preparing_at': preparing_log.created_at.isoformat(),
            'ready_at': ready_log.created_at.isoformat(),
            'prep_seconds': round(prep_seconds, 1),
            'prep_label': format_duration_seconds(prep_seconds),
            'item_count': item_count,
        })

    staff_map = {}
    for row in measured_orders:
        key = row['barista_id']
        if key not in staff_map:
            staff_map[key] = {
                'user_id': row['barista_id'],
                'name': row['barista_name'],
                'email': row['barista_email'],
                'employee_id': row['employee_id'],
                'position': row['position'],
                'position_display': row['position_display'],
                'prep_seconds_list': [],
            }
        staff_map[key]['prep_seconds_list'].append(row['prep_seconds'])

    staff_rows = []
    for entry in staff_map.values():
        values = entry.pop('prep_seconds_list')
        avg_seconds = sum(values) / len(values)
        staff_rows.append({
            **entry,
            'orders_prepared': len(values),
            'avg_prep_seconds': round(avg_seconds, 1),
            'avg_prep_label': format_duration_seconds(avg_seconds),
            'min_prep_seconds': round(min(values), 1),
            'min_prep_label': format_duration_seconds(min(values)),
            'max_prep_seconds': round(max(values), 1),
            'max_prep_label': format_duration_seconds(max(values)),
            'median_prep_seconds': round(median(values), 1),
            'median_prep_label': format_duration_seconds(median(values)),
        })

    staff_rows.sort(key=lambda row: (-row['orders_prepared'], row['avg_prep_seconds']))

    all_seconds = [row['prep_seconds'] for row in measured_orders]
    overall_avg = round(sum(all_seconds) / len(all_seconds), 1) if all_seconds else 0

    return {
        'period_days': days,
        'since': since.isoformat(),
        'baristas_only': baristas_only,
        'summary': {
            'total_orders_measured': len(measured_orders),
            'baristas_with_data': len(staff_rows),
            'overall_avg_seconds': overall_avg,
            'overall_avg_label': format_duration_seconds(overall_avg) if all_seconds else '—',
        },
        'staff': staff_rows,
        'orders': sorted(measured_orders, key=lambda row: row['ready_at'], reverse=True)[:100],
    }
