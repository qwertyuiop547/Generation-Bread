from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0027_absencerequest'),
    ]

    operations = [
        migrations.CreateModel(
            name='ShiftAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('shift_date', models.DateField(help_text='Date this shift is scheduled')),
                ('week_start', models.DateField(help_text='Monday of the week this assignment belongs to')),
                ('start_time', models.TimeField(help_text='Scheduled shift start')),
                ('end_time', models.TimeField(help_text='Scheduled shift end')),
                ('station', models.CharField(choices=[('barista', 'Barista'), ('cashier', 'Cashier'), ('manager', 'Manager'), ('delivery', 'Delivery'), ('cleaner', 'Cleaner')], help_text='Work station / role for this shift', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='shift_assignments_created', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='shift_assignments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['shift_date', 'start_time'],
            },
        ),
        migrations.AddConstraint(
            model_name='shiftassignment',
            constraint=models.UniqueConstraint(fields=('user', 'shift_date'), name='unique_shift_assignment_per_user_date'),
        ),
    ]
