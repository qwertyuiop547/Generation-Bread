import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spylt_backend.settings')
django.setup()

from accounts.models import CustomUser

# Create admin superuser
if not CustomUser.objects.filter(email='admin@spylt.com').exists():
    admin = CustomUser.objects.create_superuser(
        username='admin@spylt.com',
        email='admin@spylt.com',
        password='admin123',
        first_name='Admin',
        role='admin',
        is_email_verified=True,
    )
    print(f'Admin created: admin@spylt.com / admin123')
else:
    print('Admin already exists')

# Create test user (verified)
if not CustomUser.objects.filter(email='user@test.com').exists():
    user = CustomUser.objects.create_user(
        username='user@test.com',
        email='user@test.com',
        password='user123',
        first_name='Test User',
        role='user',
        is_email_verified=True,
    )
    print(f'Test user created: user@test.com / user123')
else:
    print('Test user already exists')

# Create staff user
if not CustomUser.objects.filter(email='staff@spylt.com').exists():
    staff = CustomUser.objects.create_user(
        username='staff@spylt.com',
        email='staff@spylt.com',
        password='staff123',
        first_name='Staff',
        role='staff',
        is_email_verified=True,
    )
    print(f'Staff user created: staff@spylt.com / staff123')
else:
    print('Staff user already exists')
