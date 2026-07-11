from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0029_orderstatuslog'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='rating_comment',
            field=models.TextField(blank=True, default='', help_text='Optional customer feedback with rating'),
        ),
        migrations.AddField(
            model_name='order',
            name='rated_at',
            field=models.DateTimeField(blank=True, help_text='When the customer submitted a rating', null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='served_by',
            field=models.ForeignKey(
                blank=True,
                help_text='Staff member tagged as having served this order',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='served_orders',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
