# Generated manually to fix DataError: Data too long for column 'current_month'

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0087_merge_points_order_metadata"),
    ]

    operations = [
        migrations.AlterField(
            model_name="visualanalysisquota",
            name="current_month",
            field=models.CharField(
                blank=True,
                help_text="当前月份标识（格式：YYYY-MM 或 YYYY-MM-DD-P{周期数}），用于判断是否需要重置月度额度",
                max_length=20,
            ),
        ),
    ]

