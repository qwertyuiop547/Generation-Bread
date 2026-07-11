"""Smart ETA: dynamic order wait estimates from queue load and prep history."""
from datetime import timedelta

from django.utils import timezone

from . import drink_prep

DEFAULT_AVG_PREP_SECONDS = 420
DEFAULT_SECONDS_PER_ITEM = 45
DEFAULT_PENDING_BUFFER_SECONDS = 90
MIN_ETA_SECONDS = 180
MAX_ETA_SECONDS = 1800


def _historical_avg_prep_seconds():
    report = drink_prep.build_drink_prep_report(days=30, baristas_only=False)
    avg = report['summary'].get('overall_avg_seconds') or 0
    if avg > 0:
        return float(avg)
    return float(DEFAULT_AVG_PREP_SECONDS)


def _item_units(order):
    return sum(item.quantity for item in order.items.all())


def _prep_seconds_for_order(item_units, avg_prep_seconds):
    """Estimate prep duration for one order based on item count."""
    scaled = avg_prep_seconds * (0.65 + min(item_units, 6) * 0.12)
    return max(MIN_ETA_SECONDS * 0.4, min(scaled, MAX_ETA_SECONDS))


def _preparing_started_at(order):
    from .models import OrderStatusLog

    log = (
        OrderStatusLog.objects.filter(order=order, status='preparing')
        .order_by('-created_at')
        .first()
    )
    return log.created_at if log else None


def _remaining_prep_seconds(order, avg_prep_seconds, now):
    prep_seconds = _prep_seconds_for_order(_item_units(order), avg_prep_seconds)
    started = _preparing_started_at(order)
    if not started:
        return prep_seconds
    elapsed = (now - started).total_seconds()
    return max(30.0, prep_seconds - elapsed)


def _format_minutes_range(min_seconds, max_seconds):
    min_minutes = max(1, int(round(min_seconds / 60)))
    max_minutes = max(min_minutes, int(round(max_seconds / 60)))
    if min_minutes == max_minutes:
        return f'~{min_minutes} min', min_minutes, max_minutes
    return f'~{min_minutes}–{max_minutes} mins', min_minutes, max_minutes


def build_eta_payload(order):
    """Return a customer-facing ETA dict for a single order."""
    from .models import Order

    now = timezone.now()
    status = order.status
    item_units = _item_units(order)
    avg_prep = _historical_avg_prep_seconds()
    data_source = 'historical' if avg_prep != DEFAULT_AVG_PREP_SECONDS else 'default'

    if status in ('ready', 'completed'):
        return {
            'status': status,
            'eta_seconds': 0,
            'eta_min_minutes': 0,
            'eta_max_minutes': 0,
            'eta_label': 'Ready now',
            'message': 'Your order is ready for pickup.',
            'queue_ahead': 0,
            'item_units': item_units,
            'source': data_source,
        }

    if status == 'cancelled':
        return {
            'status': status,
            'eta_seconds': 0,
            'eta_min_minutes': 0,
            'eta_max_minutes': 0,
            'eta_label': 'Cancelled',
            'message': 'This order was cancelled.',
            'queue_ahead': 0,
            'item_units': item_units,
            'source': data_source,
        }

    active_orders = list(
        Order.objects.filter(status__in=('pending', 'preparing'))
        .order_by('created_at', 'id')
    )
    ahead = []
    for active in active_orders:
        if active.id == order.id:
            break
        ahead.append(active)

    queue_wait = 0.0
    for ahead_order in ahead:
        if ahead_order.status == 'pending':
            queue_wait += _prep_seconds_for_order(_item_units(ahead_order), avg_prep) * 0.55
            queue_wait += DEFAULT_PENDING_BUFFER_SECONDS * 0.35
        else:
            queue_wait += _remaining_prep_seconds(ahead_order, avg_prep, now)

    if status == 'preparing':
        own_remaining = _remaining_prep_seconds(order, avg_prep, now)
        total_seconds = max(MIN_ETA_SECONDS, own_remaining)
        message = 'Your order is being prepared.'
    else:
        own_prep = _prep_seconds_for_order(item_units, avg_prep)
        total_seconds = queue_wait + own_prep + DEFAULT_PENDING_BUFFER_SECONDS
        total_seconds = max(MIN_ETA_SECONDS, min(total_seconds, MAX_ETA_SECONDS))
        if len(ahead) == 0:
            message = 'Your order is next in line.'
        elif len(ahead) == 1:
            message = '1 order ahead of yours.'
        else:
            message = f'{len(ahead)} orders ahead of yours.'

    min_seconds = total_seconds * 0.85
    max_seconds = min(MAX_ETA_SECONDS, total_seconds * 1.2)
    eta_label, eta_min_minutes, eta_max_minutes = _format_minutes_range(min_seconds, max_seconds)

    return {
        'status': status,
        'eta_seconds': int(round(total_seconds)),
        'eta_min_minutes': eta_min_minutes,
        'eta_max_minutes': eta_max_minutes,
        'eta_label': eta_label,
        'message': message,
        'queue_ahead': len(ahead),
        'item_units': item_units,
        'source': data_source,
    }


def build_preview_eta(item_units=1):
    """Estimate wait time before an order is placed (no order id yet)."""
    from .models import Order

    now = timezone.now()
    avg_prep = _historical_avg_prep_seconds()
    data_source = 'historical' if avg_prep != DEFAULT_AVG_PREP_SECONDS else 'default'
    active_orders = list(
        Order.objects.filter(status__in=('pending', 'preparing'))
        .order_by('created_at', 'id')
    )

    queue_wait = 0.0
    for active_order in active_orders:
        if active_order.status == 'pending':
            queue_wait += _prep_seconds_for_order(_item_units(active_order), avg_prep) * 0.55
            queue_wait += DEFAULT_PENDING_BUFFER_SECONDS * 0.35
        else:
            queue_wait += _remaining_prep_seconds(active_order, avg_prep, now)

    own_prep = _prep_seconds_for_order(max(1, item_units), avg_prep)
    total_seconds = queue_wait + own_prep + DEFAULT_PENDING_BUFFER_SECONDS
    total_seconds = max(MIN_ETA_SECONDS, min(total_seconds, MAX_ETA_SECONDS))

    min_seconds = total_seconds * 0.85
    max_seconds = min(MAX_ETA_SECONDS, total_seconds * 1.2)
    eta_label, eta_min_minutes, eta_max_minutes = _format_minutes_range(min_seconds, max_seconds)

    queue_ahead = len(active_orders)
    if queue_ahead == 0:
        message = 'Kitchen is clear — your order can start soon.'
    elif queue_ahead == 1:
        message = '1 order currently in the queue.'
    else:
        message = f'{queue_ahead} orders currently in the queue.'

    return {
        'status': 'preview',
        'eta_seconds': int(round(total_seconds)),
        'eta_min_minutes': eta_min_minutes,
        'eta_max_minutes': eta_max_minutes,
        'eta_label': eta_label,
        'message': message,
        'queue_ahead': queue_ahead,
        'item_units': max(1, item_units),
        'source': data_source,
    }
