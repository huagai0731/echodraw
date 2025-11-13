from __future__ import annotations

from django.db import migrations
from django.utils.text import slugify


def create_achievement_groups(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    AchievementGroup = apps.get_model("core", "AchievementGroup")

    series_map: dict[str, AchievementGroup] = {}

    for achievement in Achievement.objects.all():
        metadata = achievement.metadata or {}
        series = metadata.get("series")
        level = metadata.get("level")

        if series:
            slug_base = metadata.get("group_slug") or slugify(series) or f"group-{achievement.slug}"
            if slug_base not in series_map:
                group = AchievementGroup.objects.create(
                    slug=slug_base,
                    name=series,
                    description=metadata.get("group_description", ""),
                    category=achievement.category,
                    icon=achievement.icon,
                    display_order=achievement.display_order,
                    metadata={
                        "source": "migrated-from-achievement",
                        "auto_created": True,
                        "original_series": series,
                    },
                )
                series_map[slug_base] = group
            group = series_map[slug_base]
            achievement.group = group

        if level:
            try:
                achievement.level = int(level)
            except (TypeError, ValueError):
                achievement.level = 1

        achievement.save(update_fields=["group", "level"])


def drop_achievement_groups(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    Achievement.objects.update(group=None, level=1)
    AchievementGroup = apps.get_model("core", "AchievementGroup")
    AchievementGroup.objects.filter(metadata__source="migrated-from-achievement").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0015_achievementgroup_achievement_group_level"),
    ]

    operations = [
        migrations.RunPython(create_achievement_groups, reverse_code=drop_achievement_groups),
    ]

