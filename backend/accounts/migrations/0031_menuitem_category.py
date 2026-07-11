from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0030_order_staff_feedback'),
    ]

    operations = [
        migrations.AddField(
            model_name='menuitem',
            name='category',
            field=models.CharField(
                choices=[('drink', 'Drink'), ('food', 'Food')],
                default='drink',
                max_length=10,
            ),
        ),
    ]
