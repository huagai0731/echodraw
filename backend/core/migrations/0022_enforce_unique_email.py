from __future__ import annotations

from django.conf import settings
from django.db import migrations
from django.db.models import Count, Q


def _get_user_model(apps):
    app_label, model_name = settings.AUTH_USER_MODEL.split(".")
    return apps.get_model(app_label, model_name)


def _normalize_email_value(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def normalize_and_dedupe_emails(apps, schema_editor):
    User = _get_user_model(apps)

    # 1. 标准化大小写与空白
    for user in User.objects.exclude(Q(email__isnull=True) | Q(email="")).iterator():
        normalized = _normalize_email_value(user.email)
        if normalized != user.email:
            User.objects.filter(pk=user.pk).update(email=normalized)

    placeholder_domain = "dedup.invalid"

    # 2. 处理空邮箱，避免后续唯一索引报错
    blank_users = User.objects.filter(Q(email__isnull=True) | Q(email=""))
    for user in blank_users.iterator():
        username = (user.username or "user").lower()
        placeholder = f"{username}+noemail-{user.pk}@{placeholder_domain}"
        User.objects.filter(pk=user.pk).update(email=placeholder, is_active=False)

    # 3. 处理重复邮箱，保留优先级最高的账号
    duplicate_emails = (
        User.objects.values("email")
        .annotate(count=Count("id"))
        .filter(count__gt=1)
    )

    for entry in duplicate_emails:
        email = entry["email"]
        duplicates = list(
            User.objects.filter(email=email)
            .order_by("-is_active", "-last_login", "-date_joined", "-pk")
        )
        keeper = duplicates[0]

        local_part, sep, domain = email.partition("@")
        if not sep:
            domain = placeholder_domain
        local_part = local_part or (keeper.username or "user")
        domain = domain or placeholder_domain

        for duplicate in duplicates[1:]:
            replacement = f"{local_part}+duplicate-{duplicate.pk}@{domain}"
            User.objects.filter(pk=duplicate.pk).update(
                email=replacement,
                is_active=False,
            )


def add_unique_email_constraint(apps, schema_editor):
    User = _get_user_model(apps)
    table = schema_editor.quote_name(User._meta.db_table)
    column = schema_editor.quote_name("email")
    index_name = schema_editor.quote_name("core_user_email_lower_uniq")

    schema_editor.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} "
        f"ON {table} (LOWER({column}));"
    )


def drop_unique_email_constraint(apps, schema_editor):
    index_name = schema_editor.quote_name("core_user_email_lower_uniq")
    schema_editor.execute(f"DROP INDEX IF EXISTS {index_name};")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_merge_conflicting_0018"),
    ]

    operations = [
        migrations.RunPython(
            normalize_and_dedupe_emails,
            migrations.RunPython.noop,
        ),
        migrations.RunPython(
            add_unique_email_constraint,
            drop_unique_email_constraint,
        ),
    ]













