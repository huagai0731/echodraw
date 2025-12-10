from django.db import migrations, models
import uuid
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0011_seed_shortterm_task_presets"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserTaskPreset",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "slug",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        unique=True,
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        default="我的",
                        help_text='自定义任务分类，默认“我的”。',
                        max_length=64,
                    ),
                ),
                (
                    "title",
                    models.CharField(
                        help_text="自定义任务名称。",
                        max_length=160,
                    ),
                ),
                (
                    "description",
                    models.CharField(
                        blank=True,
                        help_text="任务简介，将展示给用户。",
                        max_length=240,
                    ),
                ),
                (
                    "metadata",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="附加元数据，保留扩展字段。",
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="user_task_presets",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-updated_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="usertaskpreset",
            index=models.Index(
                fields=["user", "-updated_at"],
                name="core_usert_user_id_a5e152_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="usertaskpreset",
            index=models.Index(
                fields=["user", "is_active"],
                name="core_usert_user_id_8036e5_idx",
            ),
        ),
    ]





































