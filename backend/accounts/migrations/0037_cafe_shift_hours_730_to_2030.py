import datetime

from django.db import migrations, models


def set_cafe_shift_hours(apps, schema_editor):
    CustomUser = apps.get_model('accounts', 'CustomUser')
    CustomUser.objects.filter(role__in=('staff', 'admin')).update(
        shift_start=datetime.time(7, 30),
        shift_end=datetime.time(20, 30),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0036_order_access_token_securityevent'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customuser',
            name='shift_end',
            field=models.TimeField(
                blank=True,
                default=datetime.time(20, 30),
                help_text='Scheduled shift end time (default: 8:30 PM)',
                null=True,
            ),
        ),
        migrations.RunPython(set_cafe_shift_hours, migrations.RunPython.noop),
    ]
