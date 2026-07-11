from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0026_staff_activity'),
    ]

    operations = [
        migrations.CreateModel(
            name='AbsenceRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('absence_date', models.DateField(help_text='Date staff will be absent')),
                ('reason', models.TextField(help_text='Reason for planned absence')),
                ('status', models.CharField(choices=[('approved', 'Approved'), ('cancelled', 'Cancelled')], default='approved', max_length=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='absence_requests_created', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='absence_requests', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-absence_date', '-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='absencerequest',
            constraint=models.UniqueConstraint(condition=models.Q(('status', 'approved')), fields=('user', 'absence_date'), name='unique_approved_absence_per_user_date'),
        ),
    ]
