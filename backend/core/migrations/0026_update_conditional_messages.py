from __future__ import annotations

from django.db import migrations


def _conditional_messages() -> list[dict[str, object]]:
    """
    条件文案列表
    包括：打卡天数、上传累计张数、上一次上传的心情、上一次上传的标签
    """
    return [
        # 打卡天数条件（连续打卡天数）
        {
            "name": "第1天打卡",
            "text": "今天的开始，会成为之后所有节奏的起点。",
            "priority": 10,
            "min_streak_days": 1,
            "max_streak_days": 1,
        },
        {
            "name": "第7天打卡",
            "text": "一周的轨迹已经成形，习惯在悄悄往前走。",
            "priority": 20,
            "min_streak_days": 7,
            "max_streak_days": 7,
        },
        {
            "name": "第10天打卡",
            "text": "第十次点开时，你已经让自己的画册更完整了一点。",
            "priority": 30,
            "min_streak_days": 10,
            "max_streak_days": 10,
        },
        {
            "name": "第14天打卡",
            "text": "两周的坚持，让创作节奏开始稳定。",
            "priority": 35,
            "min_streak_days": 14,
            "max_streak_days": 14,
        },
        {
            "name": "第28天打卡",
            "text": "无论间隔多久，再次想起画画的念头都让这一天变得特别。",
            "priority": 40,
            "min_streak_days": 28,
            "max_streak_days": 28,
        },
        {
            "name": "第49天打卡",
            "text": "七周的累积，让变化开始具备重量。",
            "priority": 50,
            "min_streak_days": 49,
            "max_streak_days": 49,
        },
        {
            "name": "第81天打卡",
            "text": "八十一天里，你留下的每一次出现，都让世界多了一点你的痕迹。",
            "priority": 60,
            "min_streak_days": 81,
            "max_streak_days": 81,
        },
        {
            "name": "第100天打卡",
            "text": "百日不过开始，祝贺你。",
            "priority": 70,
            "min_streak_days": 100,
            "max_streak_days": 100,
        },
        # 上传累计张数条件
        {
            "name": "上传达到10张",
            "text": "十张作品，见证你的创作轨迹。",
            "priority": 100,
            "min_total_uploads": 10,
            "max_total_uploads": 10,
        },
        {
            "name": "上传达到20张",
            "text": "二十张作品，习惯正在形成。",
            "priority": 110,
            "min_total_uploads": 20,
            "max_total_uploads": 20,
        },
        {
            "name": "上传达到50张",
            "text": "五十张作品，积累的力量开始显现。",
            "priority": 120,
            "min_total_uploads": 50,
            "max_total_uploads": 50,
        },
        {
            "name": "上传达到100张",
            "text": "一百张作品，这是你坚持的证明。",
            "priority": 130,
            "min_total_uploads": 100,
            "max_total_uploads": 100,
        },
        # 注意：心情和标签的文案需要根据实际的心情和标签值来配置
        # 这里提供示例，实际使用时需要在后台根据具体的心情和标签值来配置
    ]


def update_conditional_messages(apps, schema_editor):
    del schema_editor  # Unused.

    # 更新条件文案
    conditional_model = apps.get_model("core", "ConditionalMessage")
    for msg in _conditional_messages():
        defaults = {
            "text": msg["text"],
            "priority": msg["priority"],
            "is_active": True,
        }
        # 打卡天数条件
        if "min_streak_days" in msg:
            defaults["min_streak_days"] = msg["min_streak_days"]
        if "max_streak_days" in msg:
            defaults["max_streak_days"] = msg["max_streak_days"]
        # 上传累计张数条件
        if "min_total_uploads" in msg:
            defaults["min_total_uploads"] = msg["min_total_uploads"]
        if "max_total_uploads" in msg:
            defaults["max_total_uploads"] = msg["max_total_uploads"]
        # 上一次上传的心情条件
        if "match_last_upload_moods" in msg:
            defaults["match_last_upload_moods"] = msg["match_last_upload_moods"]
        # 上一次上传的标签条件
        if "match_last_upload_tags" in msg:
            defaults["match_last_upload_tags"] = msg["match_last_upload_tags"]

        conditional_model.objects.update_or_create(
            name=msg["name"],
            defaults=defaults,
        )


def reverse_update_conditional_messages(apps, schema_editor):
    del schema_editor  # Unused.
    # 不需要反向操作，保留数据
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0025_conditionalmessage_match_last_upload_moods_and_more"),
    ]

    operations = [
        migrations.RunPython(
            update_conditional_messages,
            reverse_update_conditional_messages,
        ),
    ]












