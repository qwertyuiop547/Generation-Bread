import random
import datetime
from decimal import Decimal
from django.db import models
from django.contrib.auth.models import AbstractUser
from PIL import Image


class CustomUser(AbstractUser):
    """Extended user model with email verification support."""
    ROLE_CHOICES = (
        ('user', 'User'),
        ('staff', 'Staff'),
        ('admin', 'Admin'),
    )

    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    employee_id = models.CharField(max_length=10, unique=True, blank=True, null=True, help_text='Auto-generated employee ID (e.g. SPY-0001)')
    phone = models.CharField(max_length=20, blank=True, default='', help_text='Phone number')
    POSITION_CHOICES = (
        ('barista', 'Barista'),
        ('cashier', 'Cashier'),
        ('manager', 'Manager'),
        ('delivery', 'Delivery'),
        ('cleaner', 'Cleaner'),
    )
    position = models.CharField(max_length=20, choices=POSITION_CHOICES, blank=True, default='', help_text='Staff role / position')
    shift_start = models.TimeField(blank=True, null=True, default=datetime.time(7, 30), help_text='Scheduled shift start time (default: 7:30 AM)')
    shift_end = models.TimeField(blank=True, null=True, default=datetime.time(17, 0), help_text='Scheduled shift end time (default: 5:00 PM)')
    bio = models.TextField(blank=True, default='', help_text='Short bio or notes about this staff member')
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True, help_text='Staff profile photo')
    is_email_verified = models.BooleanField(default=False)
    verification_code = models.CharField(max_length=6, blank=True, null=True)
    verification_code_created = models.DateTimeField(blank=True, null=True)

    def generate_employee_id(self):
        """Generate the next sequential employee ID (e.g. SPY-0001)."""
        last = CustomUser.objects.filter(employee_id__isnull=False).order_by('-employee_id').first()
        if last and last.employee_id:
            try:
                num = int(last.employee_id.split('-')[1]) + 1
            except (IndexError, ValueError):
                num = 1
        else:
            num = 1
        return f"SPY-{num:04d}"

    def save(self, *args, **kwargs):
        if self.role in ('staff', 'admin') and not self.employee_id:
            self.employee_id = self.generate_employee_id()
        super().save(*args, **kwargs)

    def generate_verification_code(self):
        """Generate a 6-digit verification code."""
        code = str(random.randint(100000, 999999))
        self.verification_code = code
        from django.utils import timezone
        self.verification_code_created = timezone.now()
        self.save()
        return code

    def __str__(self):
        return f"{self.email} ({self.role})"


class Order(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('preparing', 'Preparing'),
        ('ready', 'Ready'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    ORDER_TYPE_CHOICES = (
        ('dine_in', 'Dine-In'),
        ('takeout', 'Takeout'),
        ('scheduled', 'Scheduled Pickup'),
    )
    PAYMENT_METHOD_CHOICES = (
        ('cash', 'Cash'),
        ('gcash', 'GCash'),
        ('gotyme', 'GoTyme'),
        ('card', 'Card'),
    )
    PAYMENT_STATUS_CHOICES = (
        ('unpaid', 'Unpaid'),
        ('paid', 'Paid'),
    )

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='orders')
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='takeout')
    table_number = models.CharField(max_length=50, blank=True, null=True)
    pickup_time = models.CharField(max_length=50, blank=True, null=True, help_text="Scheduled pickup time (display)")
    scheduled_at = models.DateTimeField(blank=True, null=True, help_text="Scheduled pickup datetime for auto-cancel logic")
    customer_name = models.CharField(max_length=255, blank=True, default='')
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True, default='',
        help_text='How the customer will pay',
    )
    payment_status = models.CharField(
        max_length=20, choices=PAYMENT_STATUS_CHOICES, default='unpaid',
        help_text='Payment settlement status',
    )
    void_reason = models.TextField(blank=True, default='')
    rating = models.PositiveSmallIntegerField(null=True, blank=True, help_text="1 to 5 stars")
    rating_comment = models.TextField(blank=True, default='', help_text='Optional customer feedback with rating')
    rated_at = models.DateTimeField(null=True, blank=True, help_text='When the customer submitted a rating')
    served_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='served_orders',
        help_text='Staff member tagged as having served this order',
    )
    is_archived = models.BooleanField(default=False, help_text="Archived orders are hidden from the main admin view")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='order_user_created_idx'),
            models.Index(fields=['status', '-created_at'], name='order_status_created_idx'),
            models.Index(fields=['payment_status', 'status'], name='order_pay_status_idx'),
            models.Index(fields=['is_archived', 'status', '-created_at'], name='order_arch_status_idx'),
        ]

    def __str__(self):
        return f"Order #{self.id} by {self.user.email}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    size = models.CharField(max_length=20, default='Medium')
    sugar_level = models.CharField(max_length=20, default='100%')
    add_ons = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.quantity} x {self.name} (Order #{self.order.id})"


class Cart(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def total_items(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def total_price(self):
        return sum((item.price * item.quantity for item in self.items.all()), Decimal('0.00'))

    def __str__(self):
        return f"Cart for {self.user.email}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    size = models.CharField(max_length=20, default='Medium')
    sugar_level = models.CharField(max_length=20, default='100%')
    add_ons = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.quantity} x {self.name} ({self.cart.user.email})"


class MenuItem(models.Model):
    CATEGORY_CHOICES = (
        ('drink', 'Drink'),
        ('food', 'Food'),
    )

    name = models.CharField(max_length=255)
    category = models.CharField(max_length=10, choices=CATEGORY_CHOICES, default='drink')
    color = models.CharField(max_length=50)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    bg_color = models.CharField(max_length=50)
    image = models.ImageField(upload_to='menu_images/', blank=True, null=True, help_text='Menu item photo. Falls back to category placeholder if not set.')
    is_hidden = models.BooleanField(default=False)
    stock = models.PositiveIntegerField(default=0, help_text='Available inventory count. 0 = unlimited if track_stock is False.')
    track_stock = models.BooleanField(default=False, help_text='Enable inventory tracking for this item')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ShiftLog(models.Model):
    """Tracks staff clock in / clock out timestamps."""
    MARK_CHOICES = (
        ('on_time', 'On Time'),
        ('late', 'Late'),
        ('absent', 'Absent'),
    )
    STATUS_CHOICES = (
        ('pending', 'Pending Approval'),
        ('clocked_in', 'Clocked In'),
        ('on_break', 'On Break'),
        ('clocked_out', 'Clocked Out'),
        ('late', 'Late'),
        ('absent', 'Absent'),
    )
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='shift_logs')
    clock_in = models.DateTimeField(help_text='Timestamp when staff clocked in')
    clock_out = models.DateTimeField(blank=True, null=True, help_text='Timestamp when staff clocked out')
    break_start = models.DateTimeField(blank=True, null=True, help_text='Timestamp when break started')
    break_end = models.DateTimeField(blank=True, null=True, help_text='Timestamp when break ended')
    is_approved = models.BooleanField(default=False, help_text='Whether admin approved this clock-in')
    approved_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, blank=True, null=True, related_name='approved_shifts', help_text='Admin who approved this clock-in')
    approved_at = models.DateTimeField(blank=True, null=True, help_text='When admin approved this clock-in')
    attendance_mark = models.CharField(max_length=10, choices=MARK_CHOICES, blank=True, null=True, help_text='Admin mark: on_time, late, or absent')
    minutes_late = models.PositiveIntegerField(blank=True, null=True, help_text='Minutes past shift start time when clocked in')
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def status(self):
        if self.attendance_mark == 'absent':
            return 'absent'
        if not self.is_approved:
            return 'pending'
        if self.clock_out:
            return 'clocked_out'
        if self.break_start and not self.break_end:
            return 'on_break'
        if self.attendance_mark == 'late':
            return 'late'
        return 'clocked_in'

    @property
    def duration(self):
        """Return shift duration as timedelta, or None if still clocked in."""
        if self.clock_out:
            return self.clock_out - self.clock_in
        return None

    def __str__(self):
        mark = self.attendance_mark or '⏳'
        return f"ShiftLog #{self.id} - {self.user.email} ({self.clock_in:%Y-%m-%d %H:%M}) [{mark}]"


class StaffActivity(models.Model):
    """Audit-style log of staff actions for the live activity feed."""
    ACTION_CHOICES = (
        ('clock_in', 'Clocked In'),
        ('clock_out', 'Clocked Out'),
        ('break_start', 'Break Started'),
        ('break_end', 'Break Ended'),
        ('approved', 'Approved (On Time)'),
        ('marked_late', 'Marked Late'),
        ('marked_absent', 'Marked Absent'),
        ('planned_absence', 'Planned Absence Logged'),
        ('order_completed', 'Order Completed'),
        ('order_cancelled', 'Order Cancelled'),
        ('order_voided', 'Order Voided'),
    )

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='activities')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    description = models.CharField(max_length=255, help_text='Human-readable description of the action')
    performed_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='performed_activities', help_text='Admin who performed the action (if applicable)')
    shift_log = models.ForeignKey(ShiftLog, on_delete=models.SET_NULL, null=True, blank=True, related_name='activities')
    order = models.ForeignKey('Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='activities')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'staff activities'

    def __str__(self):
        return f"{self.user.first_name or self.user.email} - {self.get_action_display()} ({self.created_at:%Y-%m-%d %H:%M})"


class AbsenceRequest(models.Model):
    """Planned absence logged in advance — distinct from unexpected no-shows."""
    STATUS_CHOICES = (
        ('approved', 'Approved'),
        ('cancelled', 'Cancelled'),
    )

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='absence_requests')
    absence_date = models.DateField(help_text='Date staff will be absent')
    reason = models.TextField(help_text='Reason for planned absence')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='approved')
    created_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='absence_requests_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-absence_date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'absence_date'],
                condition=models.Q(status='approved'),
                name='unique_approved_absence_per_user_date',
            ),
        ]

    def __str__(self):
        return f"AbsenceRequest #{self.id} - {self.user.email} ({self.absence_date})"


class ShiftAssignment(models.Model):
    """Admin-assigned shift for a specific date within a week."""
    STATION_CHOICES = CustomUser.POSITION_CHOICES

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='shift_assignments')
    shift_date = models.DateField(help_text='Date this shift is scheduled')
    week_start = models.DateField(help_text='Monday of the week this assignment belongs to')
    start_time = models.TimeField(help_text='Scheduled shift start')
    end_time = models.TimeField(help_text='Scheduled shift end')
    station = models.CharField(max_length=20, choices=STATION_CHOICES, help_text='Work station / role for this shift')
    created_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='shift_assignments_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['shift_date', 'start_time']
        constraints = [
            models.UniqueConstraint(fields=['user', 'shift_date'], name='unique_shift_assignment_per_user_date'),
        ]

    def __str__(self):
        return f"ShiftAssignment #{self.id} - {self.user.email} ({self.shift_date}) [{self.station}]"


class OrderStatusLog(models.Model):
    """Timestamped order status changes for prep-time and audit metrics."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_logs')
    status = models.CharField(max_length=20, choices=Order.STATUS_CHOICES)
    changed_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='order_status_changes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['order', 'status']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f"Order #{self.order_id} → {self.status} ({self.created_at:%Y-%m-%d %H:%M})"
