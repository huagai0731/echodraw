from __future__ import annotations

from django.db import migrations


def _build_metadata(entry: dict) -> dict:
    metadata = {
        "series": entry.get("series"),
        "level": entry.get("level"),
        "condition_text": entry.get("condition_text"),
    }
    template_id = entry.get("template_id")
    if template_id is not None:
        metadata["template_id"] = template_id

    extra_metadata = entry.get("extra_metadata") or {}
    for key, value in extra_metadata.items():
        metadata[key] = value

    # Remove keys with falsy values except zero.
    return {key: value for key, value in metadata.items() if value or value == 0}


def _prepare_entries() -> list[dict]:
    entries: list[dict] = []
    order = 10

    def add_entry(data: dict):
        nonlocal order
        entry = {
            "slug": data["slug"],
            "name": data["name"],
            "category": data["category"],
            "description": data["description"],
            "is_active": True,
            "display_order": data.get("display_order", order),
            "condition": data["condition"],
            "metadata": _build_metadata(data),
        }
        entries.append(entry)
        order += 10

    # 世界留痕系列
    world_trace_templates = [1, 9, 9, 16, 16, 16, 16, 17, 28]
    world_trace_thresholds = [1, 10, 19, 35, 51, 67, 83, 100, 200]
    world_trace_descriptions = [
        "每个旅程都从一笔开始",
        "线条开始有了方向。",
        "有些事会因为重复而变得笃定。",
        "所思所想，逐渐能被描绘。",
        "如果，让世界看到我。",
        "那些细小的累积，正在构成你的形状。",
        "层层叠叠，都是你的痕迹。",
        "你认真地走过了这一百次。",
        "某些坚持本身就是答案。",
    ]
    for idx, (template_id, threshold, description) in enumerate(
        zip(world_trace_templates, world_trace_thresholds, world_trace_descriptions), start=1
    ):
        add_entry(
            {
                "slug": f"world-trace-{idx}",
                "name": f"世界留痕 {idx}",
                "category": "累计类",
                "series": "世界留痕",
                "level": idx,
                "template_id": template_id,
                "condition_text": f"上传第{threshold}幅作品",
                "description": description,
                "condition": {
                    "metric": "total_uploads",
                    "operator": ">=",
                    "threshold": threshold,
                },
            }
        )

    # 不间断的心系列
    unbroken_thresholds = [7, 14, 28, 100, 200, 300, 400, 500, 600]
    unbroken_descriptions = [
        "你开始留下连续的痕迹。",
        "节奏正在形成。",
        "日复一日，已能被看见。",
        "某些事在持续中变得温和。",
        "时间为你作证。",
        "你正在与某种深处的自己同行。",
        "沉稳的坚持已经成为本能。",
        "日子自己在书写你。",
        "你为自己保存了六百次当下。",
    ]
    for idx, (threshold, description) in enumerate(zip(unbroken_thresholds, unbroken_descriptions), start=1):
        add_entry(
            {
                "slug": f"steady-heart-{idx}",
                "name": f"不间断的心 {idx}",
                "category": "累计类",
                "series": "不间断的心",
                "level": idx,
                "condition_text": f"累计打卡{threshold}天",
                "description": description,
                "condition": {"metric": "total_checkins", "operator": ">=", "threshold": threshold},
            }
        )

    # 长路积深系列
    deep_road_hours = [10, 50, 100, 300, 500, 1000, 2000]
    deep_road_descriptions = [
        "不经意已走出第一段路。",
        "手开始记住你想说的事。",
        "光落在你坚持的地方。",
        "筋骨渐成。",
        "某些事情，从此无法退回。",
        "用十倍苦心，做突出一个。",
        "静默的时间构成了你。",
    ]
    for idx, (hours, description) in enumerate(zip(deep_road_hours, deep_road_descriptions), start=1):
        minutes = hours * 60
        add_entry(
            {
                "slug": f"long-road-deep-{idx}",
                "name": f"长路积深 {idx}",
                "category": "累计类",
                "series": "长路积深",
                "level": idx,
                "condition_text": f"累计创作时长≥{hours}小时",
                "description": description,
                "condition": {"metric": "total_duration_minutes", "operator": ">=", "threshold": minutes},
                "extra_metadata": {"threshold_hours": hours},
            }
        )

    # 单项累计类
    add_entry(
        {
            "slug": "fragments-to-poem",
            "name": "碎片成诗",
            "category": "累计类",
            "series": "碎片成诗",
            "level": 1,
            "template_id": 3,
            "condition_text": "在一天内创作3次以上",
            "description": "零散的时刻，也能汇成一段叙述。",
            "condition": {
                "metric": "uploads_per_day",
                "operator": ">=",
                "threshold": 3,
                "scope": "single_day",
            },
        }
    )

    add_entry(
        {
            "slug": "flow-moment",
            "name": "心流时刻",
            "category": "累计类",
            "series": "心流时刻",
            "level": 1,
            "template_id": 1,
            "condition_text": "单次创作时长≥8小时",
            "description": "当你沉进去，时间会自己消失。",
            "condition": {"metric": "max_session_minutes", "operator": ">=", "threshold": 8 * 60},
            "extra_metadata": {"threshold_hours": 8},
        }
    )

    add_entry(
        {
            "slug": "single-stroke-peak",
            "name": "一笔封山",
            "category": "累计类",
            "series": "一笔封山",
            "level": 1,
            "template_id": 1,
            "condition_text": "单张创作时长≥12小时",
            "description": "你在一张画里停留得很久。",
            "condition": {"metric": "max_session_minutes", "operator": ">=", "threshold": 12 * 60},
            "extra_metadata": {"threshold_hours": 12},
        }
    )

    # 一见倾心系列
    first_sight_templates = [1, 4, 9]
    first_sight_occurrences = [1, 5, 14]
    first_sight_descriptions = [
        "你确信过一次。",
        "那份肯定再次出现。",
        "你并不轻易确信，但……",
    ]
    for idx, (template_id, occurrence, description) in enumerate(
        zip(first_sight_templates, first_sight_occurrences, first_sight_descriptions), start=1
    ):
        add_entry(
            {
                "slug": f"love-at-first-sight-{idx}",
                "name": f"一见倾心 {idx}",
                "category": "累计类",
                "series": "一见倾心",
                "level": idx,
                "template_id": template_id,
                "condition_text": f"第{occurrence}次上传画作自评分=100",
                "description": description,
                "condition": {
                    "metric": "upload_self_rating",
                    "operator": ">=",
                    "threshold": 100,
                    "occurrence": occurrence,
                },
            }
        )

    # 不同时间段系列
    time_window_series = [
        (
            "清晨之光",
            "morning-light",
            [9, 9],
            [9, 18],
            {"start": "05:00", "end": "08:00"},
            [
                "一天最柔软的光给你的笔。",
                "黎明多次与您同行。",
            ],
        ),
        (
            "日中静默",
            "midday-silence",
            [9, 9],
            [9, 18],
            {"start": "12:00", "end": "14:00"},
            [
                "在喧嚣里守住安静。",
                "在纷杂中保持自己的节奏。",
            ],
        ),
        (
            "黄昏笔迹",
            "dusk-trace",
            [9, 9],
            [9, 18],
            {"start": "17:00", "end": "19:00"},
            [
                "光线开始沉下去的时候。",
                "一天的回声落在了画里。",
            ],
        ),
        (
            "深夜仍醒",
            "midnight-awake",
            [9, 9],
            [9, 18],
            {"start": "22:00", "end": "00:00", "spans_midnight": True},
            [
                "只有你和显示屏是清醒的。",
                "夜色是你的安静背景。",
            ],
        ),
        (
            "凌晨守望",
            "dawn-vigil",
            [9, 9],
            [9, 18],
            {"start": "00:00", "end": "03:00"},
            [
                "世界睡了，而你没有。",
                "在安静的深处坚持。",
            ],
        ),
        (
            "临光之隙",
            "edge-of-light",
            [9, 9],
            [9, 18],
            {"start": "03:00", "end": "05:00"},
            [
                "天快亮的时候，总会特别真实。",
                "曾与黎明并行。",
            ],
        ),
    ]
    for series_name, slug_prefix, templates, thresholds, time_window, descriptions in time_window_series:
        for idx, (template_id, threshold, description) in enumerate(zip(templates, thresholds, descriptions), start=1):
            start_time = time_window["start"]
            end_time = time_window.get("label_end", time_window["end"])
            add_entry(
                {
                    "slug": f"{slug_prefix}-{idx}",
                    "name": f"{series_name} {idx}",
                    "category": "累计类",
                    "series": series_name,
                    "level": idx,
                    "template_id": template_id,
                    "condition_text": f"{start_time}–{end_time} 上传{threshold}次",
                    "description": description,
                    "condition": {
                        "metric": "uploads_in_time_window",
                        "operator": ">=",
                        "threshold": threshold,
                        "time_window": time_window.copy(),
                    },
                }
            )

    # 心情类系列
    mood_series = [
        (
            "灵感闪起",
            "inspiration-spark",
            "灵感爆棚",
            [4, 9, 16, 28],
            [4, 13, 29, 57],
            [
                "灵感曾主动来过。",
                "多次被点亮的瞬间串成线。",
                "正在与灵感建立信任。",
                "灵感并非侥幸，你已清楚。",
            ],
        ),
        (
            "惊喜溢出",
            "surprise-overflow",
            "惊喜超标",
            [4, 9, 16, 28],
            [4, 13, 29, 57],
            [
                "有些成就发生得毫无预兆。",
                "你一次次被触动。",
                "惊喜成为一种出现方式。",
                "你对惊喜不再陌生，因为……",
            ],
        ),
        (
            "画感全开",
            "art-sense-full",
            "画感全开",
            [4, 9, 16, 28],
            [4, 13, 29, 57],
            [
                "你很清楚地知道自己在做什么。",
                "手与意图更接近了。",
                "稳定触达！",
                "长期积累的回声。",
            ],
        ),
        (
            "摸鱼圣手",
            "slacking-master",
            "摸鱼",
            [4, 9, 16, 28],
            [4, 13, 29, 57],
            [
                "轻松也是一种前进。",
                "你会自己调节节奏。",
                "松弛不是退步。",
                "摸",
            ],
        ),
    ]
    for series_name, slug_prefix, mood, templates, thresholds, descriptions in mood_series:
        for idx, (template_id, threshold, description) in enumerate(zip(templates, thresholds, descriptions), start=1):
            add_entry(
                {
                    "slug": f"{slug_prefix}-{idx}",
                    "name": f"{series_name} {idx}",
                    "category": "累计类",
                    "series": series_name,
                    "level": idx,
                    "template_id": template_id,
                    "condition_text": f"心情={mood} 上传{threshold}次",
                    "description": description,
                    "condition": {
                        "metric": "uploads_with_mood",
                        "operator": ">=",
                        "threshold": threshold,
                        "mood": mood,
                    },
                }
            )

    # 月刊连载系列
    serial_thresholds = [30, 60, 90, 120, 150, 180]
    serial_descriptions = [
        "你保持着一条线。",
        "节奏被你安稳地握着。",
        "作品成为你时间的一部分。",
        "季节更替，而你仍在。",
        "你继续了很久。",
        "画笔是一种外置器官。",
    ]
    for idx, (threshold, description) in enumerate(zip(serial_thresholds, serial_descriptions), start=1):
        add_entry(
            {
                "slug": f"monthly-serial-{idx}",
                "name": f"月刊连载 {idx}",
                "category": "连续类",
                "series": "月刊连载",
                "level": idx,
                "template_id": 30 if idx == 1 else None,
                "condition_text": f"连续{threshold}天上传",
                "description": description,
                "condition": {
                    "metric": "consecutive_upload_days",
                    "operator": ">=",
                    "threshold": threshold,
                },
            }
        )

    # 标签类系列
    tag_series = [
        (
            "摸鱼者",
            "slacker",
            "摸鱼",
            [9, 9, 16, 28],
            [9, 18, 34, 62],
            [
                "用轻松保持了连接。",
                "在松动中生长。",
                "留白是节奏的一部分。",
                "这也是一种稳定的方式。",
            ],
        ),
        (
            "成图者",
            "finisher",
            "成图",
            [None, None, None, None],
            [9, 18, 34, 62],
            [
                "一副完整的画，一个崭新落成的次元。",
                "收尾与呈现成为本能。",
                "完成已成为你的一部分。",
                "把想法带到终点。",
            ],
        ),
        (
            "临摹者",
            "copyist",
            "临摹",
            [None, None, None, None],
            [9, 18, 34, 62],
            [
                "结构被一遍遍触摸。",
                "基础在重复中被加深。",
                "积累沉在了画面下面。",
                "线条里有积累的回声。",
            ],
        ),
        (
            "速写者",
            "sketcher",
            "速写",
            [None, None, None, None],
            [9, 18, 34, 62],
            [
                "你捕捉过片刻。",
                "落笔是直觉的一部分。",
                "判断，直达手部。",
                "归纳是一种习得的天赋。",
            ],
        ),
    ]
    for series_name, slug_prefix, tag, templates, thresholds, descriptions in tag_series:
        for idx, (template_id, threshold, description) in enumerate(zip(templates, thresholds, descriptions), start=1):
            add_entry(
                {
                    "slug": f"{slug_prefix}-{idx}",
                    "name": f"{series_name}·{['初', '常', '深', '久'][idx - 1]}",
                    "category": "标签类",
                    "series": series_name,
                    "level": idx,
                    "template_id": template_id,
                    "condition_text": f"{tag}≥{threshold}",
                    "description": description,
                    "condition": {
                        "metric": "tag_usage",
                        "operator": ">=",
                        "threshold": threshold,
                        "tag": tag,
                    },
                }
            )

    # 彩蛋类
    add_entry(
        {
            "slug": "night-breath-1",
            "name": "深夜吐息 1",
            "category": "彩蛋类",
            "series": "深夜吐息",
            "level": 1,
            "template_id": 1,
            "condition_text": "01:11 上传",
            "description": "在极静处留下痕迹。",
            "condition": {"metric": "custom", "code": "exact_time_upload", "parameters": {"time": "01:11"}},
        }
    )
    add_entry(
        {
            "slug": "night-breath-2",
            "name": "深夜吐息 2",
            "category": "彩蛋类",
            "series": "深夜吐息",
            "level": 2,
            "template_id": 1,
            "condition_text": "02:22 上传",
            "description": "夜深，心声更近。",
            "condition": {"metric": "custom", "code": "exact_time_upload", "parameters": {"time": "02:22"}},
        }
    )
    add_entry(
        {
            "slug": "night-breath-3",
            "name": "深夜吐息 3",
            "category": "彩蛋类",
            "series": "深夜吐息",
            "level": 3,
            "template_id": 1,
            "condition_text": "03:33 上传",
            "description": "与世界错开了一段时间。",
            "condition": {"metric": "custom", "code": "exact_time_upload", "parameters": {"time": "03:33"}},
        }
    )

    add_entry(
        {
            "slug": "restart-emotion",
            "name": "画出答案",
            "category": "彩蛋类",
            "series": "画出答案",
            "level": 1,
            "condition_text": "连续5次心情=情绪重启",
            "description": "重启的开关已被发现。",
            "condition": {
                "metric": "custom",
                "code": "mood_streak",
                "parameters": {"mood": "情绪重启", "streak": 5},
            },
        }
    )

    add_entry(
        {
            "slug": "echo-anniversary",
            "name": "回声之年",
            "category": "彩蛋类",
            "series": "回声之年",
            "level": 1,
            "condition_text": "注册周年日当天上传",
            "description": "时间闭成一环。",
            "condition": {"metric": "custom", "code": "anniversary_upload"},
        }
    )

    add_entry(
        {
            "slug": "weekend-marathon",
            "name": "周末马拉松",
            "category": "彩蛋类",
            "series": "周末马拉松",
            "level": 1,
            "condition_text": "在同一周的周六与周日各累计创作≥6小时",
            "description": "为自己腾出了一整段时间。",
            "condition": {
                "metric": "custom",
                "code": "weekend_marathon",
                "parameters": {"min_minutes_per_day": 6 * 60},
            },
        }
    )

    add_entry(
        {
            "slug": "weekday-lunch-break",
            "name": "工作日偷闲",
            "category": "彩蛋类",
            "series": "工作日偷闲",
            "level": 1,
            "condition_text": "连续五个工作日中至少有三天午间上传作品",
            "description": "忙碌中留出午间的缝隙。",
            "condition": {
                "metric": "custom",
                "code": "weekday_lunch_window",
                "parameters": {
                    "window_days": 5,
                    "required_days": 3,
                    "time_window": {"start": "12:00", "end": "14:00"},
                },
            },
        }
    )

    add_entry(
        {
            "slug": "dusk-conversationalist",
            "name": "黄昏对话家",
            "category": "彩蛋类",
            "series": "黄昏对话家",
            "level": 1,
            "condition_text": "连续 4 周的每周日下午 17:00–19:00 上传作品",
            "description": "与黄昏对话。",
            "condition": {
                "metric": "custom",
                "code": "weekly_time_window_upload",
                "parameters": {
                    "weeks": 4,
                    "weekday": "sunday",
                    "time_window": {"start": "17:00", "end": "19:00"},
                },
            },
        }
    )

    add_entry(
        {
            "slug": "ten-flames",
            "name": "十之焰",
            "category": "彩蛋类",
            "series": "十之焰",
            "level": 1,
            "condition_text": "连续两天单日时长≥10小时",
            "description": "火燃烧得很久。",
            "condition": {
                "metric": "custom",
                "code": "consecutive_days_duration",
                "parameters": {"days": 2, "min_daily_minutes": 10 * 60},
            },
        }
    )

    add_entry(
        {
            "slug": "low-frequency-high-yield",
            "name": "低频高产",
            "category": "彩蛋类",
            "series": "低频高产",
            "level": 1,
            "condition_text": "一个月内上传≤3次，但其中单次时长≥8小时",
            "description": "选择了少而深。",
            "condition": {
                "metric": "custom",
                "code": "monthly_low_frequency_long_sessions",
                "parameters": {"max_uploads": 3, "min_session_minutes": 8 * 60},
            },
        }
    )

    add_entry(
        {
            "slug": "time-keeper",
            "name": "时间贮藏者",
            "category": "彩蛋类",
            "series": "时间贮藏者",
            "level": 1,
            "condition_text": "三个月内累计小时数突破 200 小时且每月均有贡献",
            "description": "时间沉入画里。",
            "condition": {
                "metric": "custom",
                "code": "rolling_quarter_hours",
                "parameters": {"window_months": 3, "min_total_minutes": 200 * 60, "min_monthly_minutes": 1},
            },
        }
    )

    add_entry(
        {
            "slug": "steady-output",
            "name": "稳定产出",
            "category": "彩蛋类",
            "series": "稳定产出",
            "level": 1,
            "condition_text": "连续六个月每月上传≥20 张作品",
            "description": "长期的流动被持续保持。",
            "condition": {
                "metric": "custom",
                "code": "monthly_upload_streak",
                "parameters": {"months": 6, "min_uploads_per_month": 20},
            },
        }
    )

    add_entry(
        {
            "slug": "hour-sculptor",
            "name": "小时雕刻家",
            "category": "彩蛋类",
            "series": "小时雕刻家",
            "level": 1,
            "condition_text": "单月中，单次创作时长平均≥4 小时且次数≥5",
            "description": "时间一点点被刻进作品中。",
            "condition": {
                "metric": "custom",
                "code": "monthly_session_average",
                "parameters": {"min_sessions": 5, "min_average_minutes": 4 * 60},
            },
        }
    )

    add_entry(
        {
            "slug": "hour-hunter",
            "name": "小时狩猎者",
            "category": "彩蛋类",
            "series": "小时狩猎者",
            "level": 1,
            "condition_text": "单月达到 88 小时",
            "description": "主动追逐时间。",
            "condition": {
                "metric": "custom",
                "code": "monthly_total_duration",
                "parameters": {"min_minutes": 88 * 60},
            },
        }
    )

    add_entry(
        {
            "slug": "smiling-blade",
            "name": "笑里藏刀",
            "category": "彩蛋类",
            "series": "笑里藏刀",
            "level": 1,
            "condition_text": "上传作品自评分 >80，心情标记为画废崩溃",
            "description": "太严格了！",
            "condition": {
                "metric": "upload_rating_with_mood",
                "operator": ">",
                "threshold": 80,
                "mood": "画废崩溃",
            },
        }
    )

    add_entry(
        {
            "slug": "rebound-highlight",
            "name": "低谷高光",
            "category": "彩蛋类",
            "series": "低谷高光",
            "level": 1,
            "condition_text": "连续 3 次自评≤30 后，上传一次自评≥80 的作品",
            "description": "在低点之后，是反向的生长。",
            "condition": {
                "metric": "custom",
                "code": "rating_rebound",
                "parameters": {"low_threshold": 30, "low_count": 3, "high_threshold": 80},
            },
        }
    )

    add_entry(
        {
            "slug": "joyful-self-mockery",
            "name": "愉悦的自嘲",
            "category": "彩蛋类",
            "series": "愉悦的自嘲",
            "level": 1,
            "condition_text": "上传作品自评≤30，心情标记为惊喜超标",
            "description": "荒诞以笑意被看待。",
            "condition": {
                "metric": "upload_rating_with_mood",
                "operator": "<=",
                "threshold": 30,
                "mood": "惊喜超标",
            },
        }
    )

    add_entry(
        {
            "slug": "silent-joy",
            "name": "沉默的欢喜",
            "category": "彩蛋类",
            "series": "沉默的欢喜",
            "level": 1,
            "condition_text": "上传作品但不填写任何简介且自评分 ≥80",
            "description": "无需任何解释。",
            "condition": {
                "metric": "custom",
                "code": "silent_high_rating",
                "parameters": {"min_rating": 80},
            },
        }
    )

    add_entry(
        {
            "slug": "series-craftsman",
            "name": "套系工匠",
            "category": "彩蛋类",
            "series": "套系工匠",
            "level": 1,
            "condition_text": "完成 5 套 张数大于等于5的关联图",
            "description": "你的世界。",
            "condition": {
                "metric": "custom",
                "code": "series_completion",
                "parameters": {"required_sets": 5, "min_items_per_set": 5},
            },
        }
    )

    add_entry(
        {
            "slug": "versatile-creator",
            "name": "多面手",
            "category": "彩蛋类",
            "series": "多面手",
            "level": 1,
            "condition_text": "在 1 个月内分别完成 5 种标签类型的作品",
            "description": "手法跨越多种方向。",
            "condition": {
                "metric": "custom",
                "code": "monthly_tag_diversity",
                "parameters": {"required_tags": 5},
            },
        }
    )

    add_entry(
        {
            "slug": "extreme-contrast-up",
            "name": "极端反差1",
            "category": "彩蛋类",
            "series": "极端反差",
            "level": 1,
            "condition_text": "自评分一次≤20，下一次≥80，且两张画日期间隔小于3天",
            "description": "崩溃和突破往往相邻。",
            "condition": {
                "metric": "custom",
                "code": "rating_flip_up",
                "parameters": {"low_threshold": 20, "high_threshold": 80, "max_day_gap": 3},
            },
        }
    )

    add_entry(
        {
            "slug": "extreme-contrast-down",
            "name": "极端反差2",
            "category": "彩蛋类",
            "series": "极端反差",
            "level": 2,
            "condition_text": "自评分一次≥80，下一次≤20",
            "description": "What's going on.",
            "condition": {
                "metric": "custom",
                "code": "rating_flip_down",
                "parameters": {"high_threshold": 80, "low_threshold": 20},
            },
        }
    )

    add_entry(
        {
            "slug": "low-altitude-flight",
            "name": "低空飞行",
            "category": "彩蛋类",
            "series": "低空飞行",
            "level": 1,
            "condition_text": "最近9次自评分都低于50",
            "description": "继续未曾中断。",
            "condition": {
                "metric": "custom",
                "code": "recent_rating_window",
                "parameters": {"window_size": 9, "operator": "<", "threshold": 50},
            },
        }
    )

    add_entry(
        {
            "slug": "high-altitude-cruise",
            "name": "高处缓行",
            "category": "彩蛋类",
            "series": "高处缓行",
            "level": 1,
            "condition_text": "最近9次自评分都高于90",
            "description": "维持了一段难得的清晰。",
            "condition": {
                "metric": "custom",
                "code": "recent_rating_window",
                "parameters": {"window_size": 9, "operator": ">", "threshold": 90},
            },
        }
    )

    return entries


def seed_achievements(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    entries = _prepare_entries()

    for entry in entries:
        Achievement.objects.update_or_create(slug=entry["slug"], defaults=entry)


def unseed_achievements(apps, schema_editor):
    Achievement = apps.get_model("core", "Achievement")
    entries = _prepare_entries()
    slugs = [entry["slug"] for entry in entries]
    Achievement.objects.filter(slug__in=slugs).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_longtermplancopy"),
    ]

    operations = [
        migrations.RunPython(seed_achievements, unseed_achievements),
    ]


