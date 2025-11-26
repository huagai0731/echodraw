from __future__ import annotations

from collections import defaultdict

from django.db import migrations
from django.utils.text import slugify


def merge_duplicate_groups(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    AchievementGroup = apps.get_model("core", "AchievementGroup")

    groups = list(
        AchievementGroup.objects.all().order_by("name", "display_order", "slug", "id")
    )
    canonical_by_name: dict[str, AchievementGroup] = {}

    for group in groups:
        name = (group.name or "").strip()
        if not name:
            continue
        canonical = canonical_by_name.get(name)
        if canonical is None:
            canonical_by_name[name] = group
            continue

        existing_levels = (
            Achievement.objects.filter(group=canonical)
            .order_by("level")
            .values_list("level", flat=True)
        )
        taken_levels = set(existing_levels)
        next_level = max(taken_levels) + 1 if taken_levels else 1

        duplicates = list(
            Achievement.objects.filter(group=group).order_by("level", "display_order", "id")
        )
        for achievement in duplicates:
            metadata = dict(achievement.metadata or {})
            metadata["series"] = canonical.name
            metadata["level"] = next_level
            achievement.group = canonical
            achievement.level = next_level
            achievement.metadata = metadata
            achievement.save(update_fields=["group", "level", "metadata"])
            taken_levels.add(next_level)
            next_level = max(taken_levels) + 1

        group.delete()


def normalize_groups_and_levels(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    AchievementGroup = apps.get_model("core", "AchievementGroup")

    for group in AchievementGroup.objects.all():
        desired_slug = slugify(group.name or "", allow_unicode=False)
        if desired_slug and desired_slug != group.slug:
            if not AchievementGroup.objects.filter(slug=desired_slug).exclude(id=group.id).exists():
                group.slug = desired_slug
                group.save(update_fields=["slug"])

        achievements = list(
            Achievement.objects.filter(group=group).order_by("level", "display_order", "id")
        )
        for index, achievement in enumerate(achievements, start=1):
            update_fields: list[str] = []
            if achievement.level != index:
                achievement.level = index
                update_fields.append("level")

            metadata = dict(achievement.metadata or {})
            metadata_changed = False
            if metadata.get("series") != group.name:
                metadata["series"] = group.name
                metadata_changed = True
            if metadata.get("level") != index:
                metadata["level"] = index
                metadata_changed = True

            if metadata_changed:
                achievement.metadata = metadata
                update_fields.append("metadata")

            if update_fields:
                achievement.save(update_fields=update_fields)


def remove_duplicate_achievements(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")

    grouped_levels: dict[str, set[int]] = defaultdict(set)
    for achievement in Achievement.objects.filter(group__isnull=False):
        metadata = achievement.metadata or {}
        series = (metadata.get("series") or "").strip()
        if not series:
            continue
        level = metadata.get("level") or achievement.level
        grouped_levels[series.lower()].add(level)

    for achievement in Achievement.objects.filter(group__isnull=True):
        metadata = achievement.metadata or {}
        series = (metadata.get("series") or "").strip()
        if not series:
            continue
        level = metadata.get("level") or achievement.level
        normalized = series.lower()
        if level in grouped_levels.get(normalized, set()):
            achievement.delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0017_split_achievements_into_groups"),
    ]

    operations = [
        migrations.RunPython(merge_duplicate_groups, reverse_code=noop),
        migrations.RunPython(normalize_groups_and_levels, reverse_code=noop),
        migrations.RunPython(remove_duplicate_achievements, reverse_code=noop),
    ]


