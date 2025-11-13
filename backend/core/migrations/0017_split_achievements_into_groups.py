from __future__ import annotations

from django.db import migrations


GROUP_NAMES_TO_KEEP = {
    "世界留痕",
    "不间断的心",
    "长路积深",
    "一见倾心",
    "清晨之光",
    "日中静默",
    "黄昏笔迹",
    "深夜仍醒",
    "凌晨守望",
    "临光之隙",
    "灵感闪起",
    "惊喜溢出",
    "画感全开",
    "摸鱼圣手",
    "月刊连载",
    "摸鱼者",
    "成图者",
    "临摹者",
    "速写者",
    "深夜吐息",
}


def _clean_metadata(metadata: dict | None) -> dict:
    if not isinstance(metadata, dict):
        return {}
    cleaned = dict(metadata)
    for key in (
        "series",
        "level",
        "group_slug",
        "group_description",
        "original_series",
    ):
        cleaned.pop(key, None)
    return cleaned


def split_achievements(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    AchievementGroup = apps.get_model("core", "AchievementGroup")

    keep_groups = AchievementGroup.objects.filter(name__in=GROUP_NAMES_TO_KEEP)
    keep_ids = set(keep_groups.values_list("id", flat=True))

    groups_to_remove = AchievementGroup.objects.exclude(id__in=keep_ids)
    for group in groups_to_remove:
        achievements = Achievement.objects.filter(group=group)
        for achievement in achievements:
            achievement.metadata = _clean_metadata(achievement.metadata)
            achievement.group = None
            achievement.level = 1
            achievement.save(update_fields=["metadata", "group", "level"])
        group.delete()

    # Ensure kept groups have consistent level ordering and metadata references.
    for group in AchievementGroup.objects.filter(id__in=keep_ids):
        achievements = list(
            Achievement.objects.filter(group=group).order_by("level", "display_order", "id")
        )
        for index, achievement in enumerate(achievements, start=1):
            fields_to_update: list[str] = []
            if achievement.level != index:
                achievement.level = index
                fields_to_update.append("level")

            metadata = achievement.metadata or {}
            if metadata.get("series") != group.name:
                new_metadata = dict(metadata)
                new_metadata["series"] = group.name
                achievement.metadata = new_metadata
                fields_to_update.append("metadata")

            if fields_to_update:
                achievement.save(update_fields=fields_to_update)


def merge_back(apps, schema_editor):
    # No-op reverse; keeping structure intact.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0016_populate_achievement_groups"),
    ]

    operations = [
        migrations.RunPython(split_achievements, reverse_code=merge_back),
    ]


