from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0012_usertaskpreset"),
    ]

    operations = [
        migrations.CreateModel(
            name="LongTermPlanCopy",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("min_hours", models.PositiveIntegerField(default=0, help_text="该文案适用的最少总时长（含），单位：小时。")),
                ("max_hours", models.PositiveIntegerField(blank=True, help_text="该文案适用的最大总时长（含），留空表示无限上限。", null=True)),
                ("message", models.TextField(help_text="展示给用户的提示文案，建议说明该时长区间的规划建议。")),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "长期计划文案",
                "verbose_name_plural": "长期计划文案",
                "ordering": ["min_hours", "max_hours", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="longtermplancopy",
            constraint=models.CheckConstraint(
                check=models.Q(max_hours__isnull=True)
                | models.Q(max_hours__gte=models.F("min_hours")),
                name="core_longtermplancopy_valid_range",
            ),
        ),
    ]


