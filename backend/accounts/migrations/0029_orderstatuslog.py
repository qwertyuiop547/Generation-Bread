from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0028_shiftassignment'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderStatusLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('preparing', 'Preparing'), ('ready', 'Ready'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='order_status_changes', to=settings.AUTH_USER_MODEL)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='status_logs', to='accounts.order')),
            ],
            options={
                'ordering': ['created_at'],
                'indexes': [
                    models.Index(fields=['order', 'status'], name='accounts_or_order_i_6d0b0d_idx'),
                    models.Index(fields=['status', 'created_at'], name='accounts_or_status__f8e2a1_idx'),
                ],
            },
        ),
    ]
