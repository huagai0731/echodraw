from __future__ import annotations

from django.db import migrations


def _history_messages() -> list[dict[str, object]]:
    """历史上的今天文案列表"""
    return [
        {"month": 1, "day": 3, "text": "《夏目友人帐肆》首次播出。"},
        {"month": 1, "day": 4, "text": "《迷宫饭》第1季首次播出。"},
        {"month": 1, "day": 5, "text": "《葬送的芙莉莲》第17～28集、《野良神》首次播出。"},
        {"month": 1, "day": 6, "text": "《魔法少女小圆》、《续夏目友人帐》首次播出。"},
        {"month": 1, "day": 8, "text": "《无头骑士异闻录》第一季首次播出。"},
        {"month": 1, "day": 9, "text": "《无头骑士异闻录x结》完结。"},
        {"month": 1, "day": 10, "text": "《紫罗兰永恒花园》、《无头骑士异闻录x承》首次播出。"},
        {"month": 1, "day": 11, "text": "《科学超电磁炮T》首次播出。"},
        {"month": 1, "day": 12, "text": "《怪化猫》首次播出。"},
        {"month": 1, "day": 16, "text": "《齐木楠雄的灾难》第二季首次播出。"},
        {"month": 1, "day": 21, "text": "《黑执事豪华客船篇》首次播出。"},
        {"month": 1, "day": 25, "text": "《黑塔利亚》第一季首次播出。"},
        {"month": 1, "day": 26, "text": "《蔷薇少女》第二季完结。"},
        {"month": 3, "day": 7, "text": "《美少女战士》首次播出。"},
        {"month": 3, "day": 22, "text": "《葬送的芙莉莲》第17～28集、《灼眼的夏娜》完结。"},
        {"month": 3, "day": 23, "text": "《怪化猫》完结。"},
        {"month": 3, "day": 26, "text": "《蓝色监狱》完结。"},
        {"month": 3, "day": 27, "text": "《排球少年！！第二季》、《守护甜心！派对！》完结。"},
        {"month": 3, "day": 28, "text": "《迷宫饭》第1季完结。"},
        {"month": 3, "day": 29, "text": "《黑子的篮球》第二季、《东京猫猫》完结。"},
        {"month": 4, "day": 1, "text": "《进击的巨人》第二季首次播出。"},
        {"month": 4, "day": 2, "text": "《Angel Beats!》、《轻音少女！》首次播出。"},
        {"month": 4, "day": 3, "text": "《薄樱鬼》首次播出。"},
        {"month": 4, "day": 4, "text": "《银魂》、《樱兰高校男公关部》首次播出，《紫罗兰永恒花园》完结。"},
        {"month": 4, "day": 5, "text": "《白熊咖啡厅》、《命运石之门》、《NANA》首次播出。"},
        {"month": 4, "day": 6, "text": "《鬼灭之刃》、《排球少年!!》第一季、《xxxHOLiC》、《东京猫猫》、《魔法咪路咪路》首次播出。"},
        {"month": 4, "day": 7, "text": "《文豪野犬》第一季、《进击的巨人》第一季、《黑子的篮球》第一季、《魔卡少女樱》、《吸血鬼骑士》首次播出。"},
        {"month": 4, "day": 9, "text": "《间谍×过家家》第一季、《十二国记》首次播出。"},
        {"month": 4, "day": 12, "text": "《科学超电磁炮S》、《夏目友人帐陆》首次播出。"},
        {"month": 4, "day": 13, "text": "《黑执事 -寄宿学校篇-》首次播出。"},
        {"month": 4, "day": 14, "text": "《我们仍未知道那天所看见的花的名字。》首次播出。"},
        {"month": 4, "day": 20, "text": "《命运石之门：负荷领域的既视感》首次播出。"},
        {"month": 4, "day": 22, "text": "《冰菓》首次播出。"},
        {"month": 6, "day": 17, "text": "《进击的巨人》第二季完结。"},
        {"month": 6, "day": 19, "text": "《薄樱鬼》完结。"},
        {"month": 6, "day": 22, "text": "《黑塔利亚》第一季完结。"},
        {"month": 6, "day": 27, "text": "《齐木楠雄的灾难》第二季完结。"},
        {"month": 6, "day": 30, "text": "《鬼灭之刃》完结。"},
        {"month": 7, "day": 1, "text": "《黑执事》第二季首次播出。"},
        {"month": 7, "day": 3, "text": "《free!》首次播出。"},
        {"month": 7, "day": 4, "text": "《齐木楠雄的灾难》第一季、《无头骑士异闻录x转》首次播出。"},
        {"month": 7, "day": 5, "text": "《夏目友人帐叁》首次播出。"},
        {"month": 7, "day": 6, "text": "《薄樱鬼 黎明录》首次播出。"},
        {"month": 7, "day": 7, "text": "《工作细胞》、《月刊少女野崎君》、《刀剑神域》首次播出。"},
        {"month": 7, "day": 8, "text": "《夏目友人帐》第一季首次播出。"},
        {"month": 7, "day": 11, "text": "《黑执事》第三季、《猫眼三姐妹》首次播出。"},
        {"month": 7, "day": 28, "text": "《Code Geass 反叛的鲁路修》完结。"},
        {"month": 9, "day": 21, "text": "《薄樱鬼 黎明录》完结。"},
        {"month": 9, "day": 22, "text": "《黑子的篮球》第一季完结。"},
        {"month": 9, "day": 25, "text": "《家庭教师HITMAN REBORN！》完结。"},
        {"month": 9, "day": 26, "text": "《守护甜心！！心跳》完结。"},
        {"month": 9, "day": 27, "text": "《守护甜心！》完结。"},
        {"month": 9, "day": 29, "text": "《葬送的芙莉莲》第1～16集首次播出，《进击的巨人》第一季完结。"},
        {"month": 10, "day": 2, "text": "《科学超电磁炮》、《黑执事》第一季、《薄樱鬼 碧血录》首次播出。"},
        {"month": 10, "day": 3, "text": "《野良神 ARAGOTO》、《守护甜心！派对！》首次播出。"},
        {"month": 10, "day": 4, "text": "《排球少年！！第二季》、《灼眼的夏娜Ⅱ》、《地狱少女》、《守护甜心！！心跳》首次播出。"},
        {"month": 10, "day": 5, "text": "《黑子的篮球》第二季、《夏目友人帐伍》、《灼眼的夏娜》、《Code Geass 反叛的鲁路修》首次播出。"},
        {"month": 10, "day": 6, "text": "《YURI!!! on ICE》、《魔法少女小圆剧场版 [前篇] 起始的物语》、《守护甜心！》首次播出。"},
        {"month": 10, "day": 7, "text": "《间谍×过家家》第二季、《家庭教师HITMAN REBORN！》、《宝石之国》、《蔷薇少女》第一季首次播出。"},
        {"month": 10, "day": 8, "text": "《孤独摇滚！》首次播出。"},
        {"month": 10, "day": 9, "text": "《蓝色监狱》、《四月是你的谎言》首次播出。"},
        {"month": 10, "day": 11, "text": "《链锯人》首次播出。"},
        {"month": 10, "day": 12, "text": "《妖精的尾巴第一季》首次播出。"},
        {"month": 10, "day": 13, "text": "《魔法少女小圆剧场版 [后篇] 永远的物语》、《罪恶王冠》首次播出。"},
        {"month": 10, "day": 20, "text": "《蔷薇少女》第二季首次播出。"},
        {"month": 10, "day": 21, "text": "《xxxHOLiC》完结。"},
        {"month": 10, "day": 25, "text": "《黑执事幽鬼城杀人事件篇》首次播出。"},
        {"month": 10, "day": 26, "text": "《魔法少女小圆剧场版 [新篇] 叛逆的物语》首次播出。"},
        {"month": 12, "day": 18, "text": "《薄樱鬼 碧血录》完结。"},
        {"month": 12, "day": 22, "text": "《葬送的芙莉莲》第1～16集、《刀剑神域》完结。"},
        {"month": 12, "day": 23, "text": "《间谍×过家家》第二季、《蔷薇少女》第一季完结。"},
        {"month": 12, "day": 24, "text": "《孤独摇滚！》、《间谍×过家家》第一季完结。"},
        {"month": 12, "day": 26, "text": "《齐木楠雄的灾难》第一季完结。"},
        {"month": 12, "day": 27, "text": "《链锯人》完结。"},
        {"month": 12, "day": 30, "text": "《齐木楠雄的灾难 再始动篇》首次播出。"},
    ]


def seed_daily_history_messages(apps, schema_editor):
    del schema_editor  # Unused.

    history_model = apps.get_model("core", "DailyHistoryMessage")
    for msg in _history_messages():
        # 根据月份选择年份：11-12月使用2025年，1-10月使用2026年
        # 查询时按月-日匹配，所以年份不影响显示
        from datetime import date
        year = 2025 if msg["month"] >= 11 else 2026
        target_date = date(year, msg["month"], msg["day"])
        
        history_model.objects.update_or_create(
            date=target_date,
            defaults={
                "headline": "",  # 不需要标题
                "text": msg["text"],
                "is_active": True,
            },
        )


def unseed_daily_history_messages(apps, schema_editor):
    del schema_editor  # Unused.

    history_model = apps.get_model("core", "DailyHistoryMessage")
    from datetime import date
    
    for msg in _history_messages():
        # 根据月份选择年份：11-12月使用2025年，1-10月使用2026年
        year = 2025 if msg["month"] >= 11 else 2026
        target_date = date(year, msg["month"], msg["day"])
        history_model.objects.filter(date=target_date).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0026_update_conditional_messages"),
    ]

    operations = [
        migrations.RunPython(
            seed_daily_history_messages,
            unseed_daily_history_messages,
        ),
    ]

