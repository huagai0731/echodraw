# Generated manually to remove registration_number field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0076_merge_0013_and_0075"),
    ]

    operations = [
        # 删除索引
        migrations.RemoveIndex(
            model_name="userprofile",
            name="core_userpr_registr_3e9680_idx",
        ),
        # 删除字段
        migrations.RemoveField(
            model_name="userprofile",
            name="registration_number",
        ),
    ]

