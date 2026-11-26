"""Daily and weekly demand forecast from completed orders.

Uses the average of the same weekday in past weeks. That is a small,
explainable model: day-of-week is the main pattern. A monthly comparison
is included only when the shop already has orders in the current month.
"""

from collections import defaultdict
from datetime import timedelta
from math import ceil

from django.utils import timezone

from .models import MenuItem, Order


def _local_day(dt):
    return timezone.localtime(dt).date()


def build_demand_forecast():
    now = timezone.localtime()
    today = now.date()
    tomorrow = today + timedelta(days=1)
    orders = list(
        Order.objects.filter(status="completed")
        .prefetch_related("items")
        .order_by("created_at")
    )

    by_date = defaultdict(lambda: {"orders": 0, "items": defaultdict(int), "hours": defaultdict(int)})
    for order in orders:
        local = timezone.localtime(order.created_at)
        bucket = by_date[local.date()]
        bucket["orders"] += 1
        bucket["hours"][local.hour] += 1
        for line in order.items.all():
            bucket["items"][line.name] += int(line.quantity or 0)

    def weekday_samples(target_date, lookback_weeks=8):
        samples = []
        for weeks_ago in range(1, lookback_weeks + 1):
            day = target_date - timedelta(days=7 * weeks_ago)
            if day in by_date:
                samples.append(by_date[day])
        return samples

    def average_orders(samples):
        if not samples:
            if not by_date:
                return 0
            return round(sum(day["orders"] for day in by_date.values()) / len(by_date))
        return round(sum(day["orders"] for day in samples) / len(samples))

    def average_items(samples):
        totals = defaultdict(float)
        if not samples:
            samples = list(by_date.values())
        if not samples:
            return []
        for day in samples:
            for name, qty in day["items"].items():
                totals[name] += qty
        ranked = sorted(totals.items(), key=lambda pair: pair[1], reverse=True)
        return [
            {"name": name, "expected_qty": max(1, round(total / len(samples)))}
            for name, total in ranked[:5]
            if total > 0
        ]

    def describe_day(target_date):
        samples = weekday_samples(target_date)
        expected = average_orders(samples)
        return {
            "date": target_date.isoformat(),
            "weekday": target_date.strftime("%A"),
            "expected_orders": expected,
            "based_on_days": len(samples),
            "top_items": average_items(samples),
        }

    daily = describe_day(tomorrow)
    week = [describe_day(today + timedelta(days=offset)) for offset in range(7)]
    weekly_orders = sum(day["expected_orders"] for day in week)

    hour_totals = defaultdict(int)
    for day in by_date.values():
        for hour, count in day["hours"].items():
            hour_totals[hour] += count
    peak_hour = max(hour_totals, key=hour_totals.get) if hour_totals else None

    month_days = [day for day in by_date if day.year == today.year and day.month == today.month]
    seasonal_note = "Not enough history yet for a monthly seasonal adjustment. The forecast uses recent same-weekday averages."
    if len(month_days) >= 7 and len(by_date) > len(month_days):
        month_avg = sum(by_date[day]["orders"] for day in month_days) / len(month_days)
        overall_avg = sum(day["orders"] for day in by_date.values()) / len(by_date)
        if overall_avg:
            factor = month_avg / overall_avg
            daily["expected_orders"] = max(0, round(daily["expected_orders"] * factor))
            for day in week:
                day["expected_orders"] = max(0, round(day["expected_orders"] * factor))
            weekly_orders = sum(day["expected_orders"] for day in week)
            direction = "busier" if factor >= 1.1 else "quieter" if factor <= 0.9 else "about the same as"
            seasonal_note = (
                f"This month is {direction} a typical day in the saved history, "
                f"so the same-weekday average was adjusted ({factor:.2f}x)."
            )

    def staff_for(order_count):
        baristas = max(1, ceil(order_count / 20)) if order_count else 1
        cashiers = 1 if order_count >= 12 else 1
        if order_count >= 40:
            baristas += 1
        return {"baristas": baristas, "cashiers": cashiers}

    tomorrow_staff = staff_for(daily["expected_orders"])
    busiest = max(week, key=lambda day: day["expected_orders"]) if week else daily
    staffing_text = (
        f"For {daily['weekday']}, expect about {daily['expected_orders']} completed orders. "
        f"Recommend {tomorrow_staff['baristas']} barista"
        f"{'' if tomorrow_staff['baristas'] == 1 else 's'} and {tomorrow_staff['cashiers']} cashier on the floor. "
        f"The busiest day in the coming week looks like {busiest['weekday']} "
        f"({busiest['expected_orders']} orders)."
    )
    if peak_hour is not None:
        shown = peak_hour % 12 or 12
        suffix = "AM" if peak_hour < 12 else "PM"
        staffing_text += f" Past orders peak around {shown}:00 {suffix}, so keep the full crew on before that hour."

    stock_rows = []
    expected_by_item = {item["name"]: item["expected_qty"] for item in daily["top_items"]}
    for menu_item in MenuItem.objects.filter(track_stock=True).order_by("name"):
        expected = expected_by_item.get(menu_item.name, 0)
        if menu_item.stock <= 5 or (expected and menu_item.stock < expected):
            stock_rows.append({
                "name": menu_item.name,
                "on_hand": menu_item.stock,
                "expected_tomorrow": expected,
                "note": "Restock before tomorrow." if menu_item.stock < max(expected, 1) else "Low stock.",
            })

    return {
        "method": "Same-weekday average from completed orders, with a monthly adjustment when enough history exists.",
        "history_days": len(by_date),
        "seasonal_note": seasonal_note,
        "peak_hour": peak_hour,
        "daily": daily,
        "weekly": {
            "expected_orders": weekly_orders,
            "days": week,
        },
        "staffing": {
            "summary": staffing_text,
            "tomorrow": tomorrow_staff,
        },
        "inventory": stock_rows,
    }
