# Generated migration for adding membership_started_at field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0082_add_featured_artwork_ids"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="membership_started_at",
            field=models.DateTimeField(
                blank=True,
                help_text="会员开通时间。用于计算月度重置周期。",
                null=True,
            ),
        ),
    ]

