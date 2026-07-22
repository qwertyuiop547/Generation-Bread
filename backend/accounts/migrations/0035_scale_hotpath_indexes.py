# Scale readiness indexes for ShiftLog / StaffActivity / MenuItem / Order hot paths
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0034_order_scale_indexes'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['order_type', 'status'], name='order_type_status_idx'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['table_number', 'status'], name='order_table_status_idx'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['rating', '-rated_at'], name='order_rating_rated_idx'),
        ),
        migrations.AddIndex(
            model_name='menuitem',
            index=models.Index(fields=['is_hidden', 'category'], name='menuitem_hidden_cat_idx'),
        ),
        migrations.AddIndex(
            model_name='menuitem',
            index=models.Index(fields=['name'], name='menuitem_name_idx'),
        ),
        migrations.AddIndex(
            model_name='shiftlog',
            index=models.Index(fields=['user', 'clock_out'], name='shiftlog_user_out_idx'),
        ),
        migrations.AddIndex(
            model_name='shiftlog',
            index=models.Index(fields=['-clock_in'], name='shiftlog_clock_in_idx'),
        ),
        migrations.AddIndex(
            model_name='shiftlog',
            index=models.Index(fields=['is_approved', '-clock_in'], name='shiftlog_approved_idx'),
        ),
        migrations.AddIndex(
            model_name='staffactivity',
            index=models.Index(fields=['-created_at'], name='staffact_created_idx'),
        ),
        migrations.AddIndex(
            model_name='staffactivity',
            index=models.Index(fields=['user', '-created_at'], name='staffact_user_created_idx'),
        ),
        migrations.AddIndex(
            model_name='staffactivity',
            index=models.Index(fields=['action', '-created_at'], name='staffact_action_created_idx'),
        ),
    ]
