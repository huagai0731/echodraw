from __future__ import annotations

import importlib

from django.db import migrations
from django.utils.text import slugify


def restore_seeded_achievements(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    AchievementGroup = apps.get_model("core", "AchievementGroup")

    seed_module = importlib.import_module("core.migrations.0014_seed_achievements")
    prepare_entries = getattr(seed_module, "_prepare_entries")
    entries = prepare_entries()

    for entry in entries:
        metadata = entry.get("metadata") or {}
        series = metadata.get("series")
        group = None

        if series:
            slug_base = metadata.get("group_slug") or slugify(series) or entry["slug"]
            group_defaults = {
                "slug": slug_base,
                "name": series,
                "description": metadata.get("group_description", ""),
                "category": entry.get("category", ""),
                "icon": entry.get("icon", ""),
                "display_order": entry.get("display_order", 100),
                "metadata": {
                    "source": "seed-restore",
                    "original_series": series,
                },
            }
            group, _ = AchievementGroup.objects.get_or_create(
                name=series,
                defaults=group_defaults,
            )

        defaults = {
            "name": entry["name"],
            "description": entry.get("description", ""),
            "category": entry.get("category", ""),
            "icon": entry.get("icon", ""),
            "is_active": True,
            "display_order": entry.get("display_order", 100),
            "condition": entry.get("condition") or {},
            "metadata": metadata,
            "level": metadata.get("level") or entry.get("level") or 1,
            "group": group,
        }

        Achievement.objects.update_or_create(
            slug=entry["slug"],
            defaults=defaults,
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_merge_conflicting_0018"),
    ]

    operations = [
        migrations.RunPython(restore_seeded_achievements, reverse_code=noop),
    ]








