import datetime
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spylt_backend.settings')
django.setup()

from accounts.models import CustomUser

CAFE_SHIFT_START = datetime.time(7, 30)
CAFE_SHIFT_END = datetime.time(20, 30)


def upsert_demo_user(
    *,
    email: str,
    password: str,
    first_name: str,
    role: str,
    is_superuser: bool = False,
    with_shift_hours: bool = False,
):
    """Create or refresh demo accounts so known credentials stay valid after deploys."""
    user = CustomUser.objects.filter(email=email).first()
    created = user is None
    if created:
        create = CustomUser.objects.create_superuser if is_superuser else CustomUser.objects.create_user
        kwargs = dict(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            role=role,
            is_email_verified=True,
        )
        if with_shift_hours:
            kwargs['shift_start'] = CAFE_SHIFT_START
            kwargs['shift_end'] = CAFE_SHIFT_END
        user = create(**kwargs)
    else:
        user.first_name = first_name
        user.role = role
        user.is_email_verified = True
        user.is_active = True
        if is_superuser:
            user.is_staff = True
            user.is_superuser = True
        if with_shift_hours:
            user.shift_start = CAFE_SHIFT_START
            user.shift_end = CAFE_SHIFT_END
        user.set_password(password)
        user.save()

    action = 'created' if created else 'updated'
    print(f'Demo {role} {action}: {email} / {password}')
    return user


upsert_demo_user(
    email='admin@spylt.com',
    password='admin123',
    first_name='Admin',
    role='admin',
    is_superuser=True,
    with_shift_hours=True,
)

upsert_demo_user(
    email='user@test.com',
    password='user123',
    first_name='Test User',
    role='user',
)

upsert_demo_user(
    email='staff@spylt.com',
    password='staff123',
    first_name='Staff',
    role='staff',
    with_shift_hours=True,
)

# Keep all kitchen accounts on café hours (7:30 AM – 8:30 PM).
updated = CustomUser.objects.filter(role__in=('staff', 'admin')).update(
    shift_start=CAFE_SHIFT_START,
    shift_end=CAFE_SHIFT_END,
)
print(f'Staff/admin shift hours set to 07:30–20:30 ({updated} users)')
