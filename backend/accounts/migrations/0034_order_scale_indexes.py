# Generated manually for Order hot-path indexes (50k concurrent readiness)
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0033_order_payment_maya_to_gotyme'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='order',
            options={'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['user', '-created_at'], name='order_user_created_idx'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['status', '-created_at'], name='order_status_created_idx'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['payment_status', 'status'], name='order_pay_status_idx'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['is_archived', 'status', '-created_at'], name='order_arch_status_idx'),
        ),
    ]
