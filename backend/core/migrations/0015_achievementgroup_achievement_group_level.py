from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0014_seed_achievements"),
    ]

    operations = [
        migrations.CreateModel(
            name="AchievementGroup",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                (
                    "slug",
                    models.SlugField(
                        help_text="成就组唯一标识，建议使用英文短标签。",
                        max_length=64,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(help_text="成就组名称。", max_length=128)),
                ("description", models.TextField(blank=True, help_text="成就组描述或引导文案。")),
                (
                    "category",
                    models.CharField(
                        blank=True,
                        help_text="可选分类标签，便于分组展示。",
                        max_length=64,
                    ),
                ),
                (
                    "icon",
                    models.CharField(
                        blank=True,
                        help_text="成就组图标（URL 或资源标识）。",
                        max_length=256,
                    ),
                ),
                (
                    "display_order",
                    models.PositiveIntegerField(
                        default=100,
                        help_text="用于排序，数值越小越靠前。",
                    ),
                ),
                (
                    "metadata",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="附加元数据，例如分组逻辑、展示配置等。",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["display_order", "slug"],
                "verbose_name": "成就组",
                "verbose_name_plural": "成就组",
            },
        ),
        migrations.AddField(
            model_name="achievement",
            name="group",
            field=models.ForeignKey(
                blank=True,
                help_text="所属成就组，可为空表示独立成就。",
                null=True,
                on_delete=models.CASCADE,
                related_name="achievements",
                to="core.achievementgroup",
            ),
        ),
        migrations.AddField(
            model_name="achievement",
            name="level",
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text="在成就组内的层级，1 表示第一层。",
            ),
        ),
        migrations.AddIndex(
            model_name="achievement",
            index=models.Index(fields=["group", "level"], name="core_achiev_group_le_idx"),
        ),
        migrations.AddConstraint(
            model_name="achievement",
            constraint=models.UniqueConstraint(
                condition=models.Q(("group__isnull", False)),
                fields=("group", "level"),
                name="core_achievement_unique_group_level",
            ),
        ),
    ]






