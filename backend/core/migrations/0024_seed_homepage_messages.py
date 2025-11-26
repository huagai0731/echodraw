from __future__ import annotations

from django.db import migrations


def _general_messages() -> list[str]:
    """通用文案列表（当不是特殊打卡日期时显示）"""
    return [
        "让你的每一笔，都被温柔记录。",
        "把想画的，都交给这里。",
        "创作的轨迹，会在这里慢慢显现。",
        "给日常的练习一个安静的落点。",
        "从第一张开始，累积属于你自己的画册。",
        "每一次练习，都算数。",
        "让创作形成节律，让积累变得可见。",
        "从习惯到成果，给你的绘画旅程一条清晰的路径。",
        "用作品记录成长，用数据认识自己。",
        "坚持的轨迹，会比你想象得更好看。",
        "随手画、慢慢画、想画就画。",
        "你的创作步伐，无需与任何人比较。",
        "为练习保留空间，为灵感留出余地。",
        "不用准备，只要开始。",
        "画得多也好，画得少也好，这里都会为你存好。",
        "专注笔触，也专注你的变化。",
        "让灵感的波纹被轻轻保存。",
        "把散落的灵感连成一条线。",
        "日复一日，世界变得不一样。",
        "记录，才能看见自己的力量。",
        "你的绘画旅程，从这里展开。",
        "创作不需要复杂的开始。",
        "留住每一次落笔的意义。",
        "把时间变成作品，把作品变成故事。",
        "简单记录，稳稳沉淀。",
        "把作品整理得更清楚，把节奏保持得更稳定。",
        "让创作过程透明，让积累路径清晰。",
        "一眼看到自己的进度，一步步走得更有方向。",
        "作品在增长，习惯也在成形。",
        "练习的频率，会成为你的画风基石。",
        "无论起步在哪，每一张都值得好好放下。",
        "轻轻开始，慢慢变好。",
        "想试试的时候，就来这里留下点什么。",
        "不需要完美，只要真实的当下。",
        "小小一步，也能堆成很长的路。",
        "时间会帮你证明坚持的价值。",
        "把创作放进时间轴，变化会自动显现。",
        "当作品排成一列，节奏就被看见了。",
        "让练习的日常在时间里生出形状。",
        "从今天到未来，作品会替你说话。",
        "每一张作品，都是你风格的证据。",
        "打开页面，就像打开自己的画册封面。",
        "从落笔到存档，是完整的一次呼吸。",
        "把注意力交给线条，把记录交给系统。",
        "保持一个固定的开始，让创作更容易继续。",
        "给画画留一块空间，让心思更靠近笔尖。",
        "画着画着，就往前了。",
        "让创作自有节律。",
        "把散乱的练习放成一条线。",
        "记录作品，也记录自己。",
        "你画的每一笔，都算数。",
    ]


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


def seed_homepage_messages(apps, schema_editor):
    del schema_editor  # Unused.

    # 导入通用文案到 EncouragementMessage
    encouragement_model = apps.get_model("core", "EncouragementMessage")
    for text in _general_messages():
        encouragement_model.objects.get_or_create(
            text=text,
            defaults={
                "weight": 1,
                "is_active": True,
            },
        )

    # 导入条件文案到 ConditionalMessage
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


def unseed_homepage_messages(apps, schema_editor):
    del schema_editor  # Unused.

    # 删除通用文案
    encouragement_model = apps.get_model("core", "EncouragementMessage")
    general_texts = _general_messages()
    encouragement_model.objects.filter(text__in=general_texts).delete()

    # 删除条件文案
    conditional_model = apps.get_model("core", "ConditionalMessage")
    conditional_names = [msg["name"] for msg in _conditional_messages()]
    conditional_model.objects.filter(name__in=conditional_names).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0023_conditionalmessage_holidaymessage"),
    ]

    operations = [
        migrations.RunPython(
            seed_homepage_messages,
            unseed_homepage_messages,
        ),
    ]

