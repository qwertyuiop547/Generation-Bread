from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0038_menuitem_image_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_address',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Street address for delivery orders',
                max_length=240,
            ),
        ),
    ]
