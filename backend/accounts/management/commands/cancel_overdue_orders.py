from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import Order


class Command(BaseCommand):
    help = 'Auto-cancel scheduled orders whose pickup time has passed without being fulfilled'

    def add_arguments(self, parser):
        parser.add_argument(
            '--grace-minutes',
            type=int,
            default=30,
            help='Minutes after scheduled pickup time before auto-cancel (default: 30)',
        )

    def handle(self, *args, **options):
        grace_minutes = options['grace_minutes']
        now = timezone.now()
        cutoff = now - timezone.timedelta(minutes=grace_minutes)

        # Find scheduled orders that are still pending/preparing and past their pickup time + grace
        overdue_orders = Order.objects.filter(
            order_type='scheduled',
            scheduled_at__isnull=False,
            scheduled_at__lt=cutoff,
            status__in=('pending', 'preparing'),
        )

        count = overdue_orders.count()
        if count == 0:
            self.stdout.write('No overdue scheduled orders found.')
            return

        for order in overdue_orders:
            order.status = 'cancelled'
            order.void_reason = f'Auto-cancelled: scheduled pickup at {order.pickup_time} was not fulfilled within {grace_minutes} minutes'
            order.save()

        self.stdout.write(self.style.SUCCESS(f'Auto-cancelled {count} overdue scheduled order(s).'))
