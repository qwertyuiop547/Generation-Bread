import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spylt_backend.settings')
django.setup()

from accounts.models import CustomUser


def upsert_demo_user(
    *,
    email: str,
    password: str,
    first_name: str,
    role: str,
    is_superuser: bool = False,
):
    """Create or refresh demo accounts so known credentials stay valid after deploys."""
    user = CustomUser.objects.filter(email=email).first()
    created = user is None
    if created:
        create = CustomUser.objects.create_superuser if is_superuser else CustomUser.objects.create_user
        user = create(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            role=role,
            is_email_verified=True,
        )
    else:
        user.first_name = first_name
        user.role = role
        user.is_email_verified = True
        user.is_active = True
        if is_superuser:
            user.is_staff = True
            user.is_superuser = True
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
)
