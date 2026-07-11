from datetime import timedelta

from django.db.models import Q
from django.utils import timezone


def build_staff_feedback_report(days=90):
    from .models import CustomUser, Order

    since = timezone.now() - timedelta(days=days)
    position_labels = dict(CustomUser.POSITION_CHOICES)

    rated_orders = (
        Order.objects.filter(rating__isnull=False)
        .filter(Q(rated_at__gte=since) | Q(rated_at__isnull=True, created_at__gte=since))
        .select_related('user', 'served_by')
        .order_by('-rated_at', '-created_at')
    )

    untagged = []
    staff_map = {}

    for order in rated_orders:
        order_row = {
            'order_id': order.id,
            'order_label': f'ORD-{order.id:04d}',
            'customer_name': order.customer_name or order.user.first_name or order.user.email.split('@')[0],
            'customer_email': order.user.email,
            'rating': order.rating,
            'rating_comment': order.rating_comment or '',
            'rated_at': (order.rated_at or order.created_at).isoformat(),
            'order_date': order.created_at.isoformat(),
            'served_by': None,
        }

        if order.served_by_id:
            staff = order.served_by
            order_row['served_by'] = {
                'id': staff.id,
                'name': staff.first_name or staff.email.split('@')[0],
                'email': staff.email,
                'employee_id': staff.employee_id,
                'position': staff.position,
                'position_display': position_labels.get(staff.position, staff.position or 'Staff'),
            }

            bucket = staff_map.setdefault(staff.id, {
                'user_id': staff.id,
                'name': staff.first_name or staff.email.split('@')[0],
                'email': staff.email,
                'employee_id': staff.employee_id,
                'position': staff.position,
                'position_display': position_labels.get(staff.position, staff.position or 'Staff'),
                'ratings': [],
                'reviews': [],
            })
            bucket['ratings'].append(order.rating)
            bucket['reviews'].append({
                'order_id': order.id,
                'order_label': order_row['order_label'],
                'rating': order.rating,
                'comment': order.rating_comment or '',
                'rated_at': order_row['rated_at'],
                'customer_name': order_row['customer_name'],
            })
        else:
            untagged.append(order_row)

    staff_rows = []
    for entry in staff_map.values():
        ratings = entry.pop('ratings')
        reviews = entry.pop('reviews')
        avg_rating = round(sum(ratings) / len(ratings), 2)
        staff_rows.append({
            **entry,
            'review_count': len(ratings),
            'avg_rating': avg_rating,
            'avg_rating_label': f'{avg_rating:.1f} ★',
            'five_star': sum(1 for r in ratings if r == 5),
            'four_star': sum(1 for r in ratings if r == 4),
            'three_star': sum(1 for r in ratings if r == 3),
            'two_star': sum(1 for r in ratings if r == 2),
            'one_star': sum(1 for r in ratings if r == 1),
            'recent_reviews': reviews[:5],
        })

    staff_rows.sort(key=lambda row: (-row['review_count'], -row['avg_rating']))

    tagged_count = sum(row['review_count'] for row in staff_rows)
    all_ratings = [order.rating for order in rated_orders]
    overall_avg = round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 0

    return {
        'period_days': days,
        'since': since.isoformat(),
        'summary': {
            'total_ratings': len(all_ratings),
            'tagged_ratings': tagged_count,
            'untagged_ratings': len(untagged),
            'staff_with_feedback': len(staff_rows),
            'overall_avg_rating': overall_avg,
            'overall_avg_label': f'{overall_avg:.1f} ★' if all_ratings else '—',
        },
        'staff': staff_rows,
        'untagged_reviews': untagged[:50],
    }
