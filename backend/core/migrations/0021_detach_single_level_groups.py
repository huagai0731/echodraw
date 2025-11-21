from __future__ import annotations

from django.db import migrations


def detach_single_level_groups(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    AchievementGroup = apps.get_model("core", "AchievementGroup")

    single_groups = []
    for group in AchievementGroup.objects.all():
        achievements = list(
            Achievement.objects.filter(group=group).order_by("level", "display_order", "id")
        )
        if len(achievements) <= 1:
            single_groups.append((group, achievements))

    for group, achievements in single_groups:
        for achievement in achievements:
            metadata = dict(achievement.metadata or {})
            for key in ("series", "level", "group_slug", "group_description"):
                metadata.pop(key, None)

            achievement.group = None
            achievement.level = 1
            achievement.metadata = metadata
            achievement.save(update_fields=["group", "level", "metadata"])

        group.delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0020_restore_seeded_achievements"),
    ]

    operations = [
        migrations.RunPython(detach_single_level_groups, reverse_code=noop),
    ]












