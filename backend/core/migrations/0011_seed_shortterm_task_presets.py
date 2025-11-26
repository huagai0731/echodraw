from __future__ import annotations

from django.db import migrations


def _presets() -> list[dict[str, object]]:
    category_offsets = {
        "人体": 100,
        "色彩": 200,
        "构成": 300,
        "角色设计": 400,
    }

    data = [
        {
            "code": "figure-gesture-30min",
            "category": "人体",
            "title": "30分钟速写挑战",
            "description": "画3个不同姿势的人体（30分钟）",
            "metadata": {
                "duration_minutes": 30,
                "pose_count": 3,
                "focus": "figure-gesture",
            },
        },
        {
            "code": "figure-hands-study",
            "category": "人体",
            "title": "手部特写连画",
            "description": "画5种手势（30分钟）",
            "metadata": {
                "duration_minutes": 30,
                "variation_count": 5,
                "focus": "hand-structure",
            },
        },
        {
            "code": "figure-perspective-challenge",
            "category": "人体",
            "title": "透视姿态挑战",
            "description": "画一个大仰视或俯视的人体（20分钟）",
            "metadata": {
                "duration_minutes": 20,
                "focus": "figure-perspective",
                "view_angle": ["仰视", "俯视"],
            },
        },
        {
            "code": "figure-shoulder-neck-study",
            "category": "人体",
            "title": "肩颈关系矫正",
            "description": "画3个不同角度的上半身（30分钟）",
            "metadata": {
                "duration_minutes": 30,
                "variation_count": 3,
                "focus": "upper-body-structure",
            },
        },
        {
            "code": "figure-action-storyboard",
            "category": "人体",
            "title": "动作表演连拍",
            "description": "画一个小动作分镜（3帧）（60分钟）",
            "metadata": {
                "duration_minutes": 60,
                "frame_count": 3,
                "focus": "figure-acting",
            },
        },
        {
            "code": "color-monochrome-study",
            "category": "色彩",
            "title": "单色主调小稿",
            "description": "整幅画只用一种色相变化",
            "metadata": {
                "palette": "monochrome",
                "focus": "hue-variation",
            },
        },
        {
            "code": "color-high-saturation",
            "category": "色彩",
            "title": "高纯度挑战",
            "description": "尝试只用高饱和色，画一幅可控不炸眼的画",
            "metadata": {
                "palette": "high-saturation",
                "focus": "saturation-control",
            },
        },
        {
            "code": "color-low-saturation-mood",
            "category": "色彩",
            "title": "低饱和氛围练习",
            "description": "用灰调表达温柔氛围",
            "metadata": {
                "palette": "low-saturation",
                "focus": "atmosphere",
            },
        },
        {
            "code": "color-spot-contrast",
            "category": "色彩",
            "title": "局部撞色练习",
            "description": "画面整体统一单色调，仅一个部位使用对比色",
            "metadata": {
                "palette": "accent-contrast",
                "focus": "color-balance",
            },
        },
        {
            "code": "color-day-night-variant",
            "category": "色彩",
            "title": "日夜版同图",
            "description": "同一角色白天版与夜晚版配色对照",
            "metadata": {
                "variants": ["day", "night"],
                "focus": "lighting-shift",
            },
        },
        {
            "code": "color-emotion-palette",
            "category": "色彩",
            "title": "心情配色",
            "description": "选择一个情绪（焦虑/平静/浪漫）进行色彩表达",
            "metadata": {
                "focus": "emotion-palette",
                "emotions": ["焦虑", "平静", "浪漫"],
            },
        },
        {
            "code": "color-master-study",
            "category": "色彩",
            "title": "临摹转译",
            "description": "参考一张名画的色卡进行创作",
            "metadata": {
                "focus": "palette-translation",
                "reference": "master-painting",
            },
        },
        {
            "code": "composition-flow-guides",
            "category": "构成",
            "title": "视觉流动练习",
            "description": "画中安排3个引导视线的元素，保持画面节奏感",
            "metadata": {
                "focus": "visual-flow",
                "guide_count": 3,
            },
        },
        {
            "code": "composition-background-harmony",
            "category": "构成",
            "title": "背景呼应主体",
            "description": "画一个有呼应元素的背景",
            "metadata": {
                "focus": "background-integration",
            },
        },
        {
            "code": "composition-dense-geometry",
            "category": "构成",
            "title": "密集构成挑战",
            "description": "使用基本几何体完成，画面塞满但要保持秩序",
            "metadata": {
                "focus": "dense-layout",
                "constraints": ["basic-geometry"],
            },
        },
        {
            "code": "composition-symmetry-experiment",
            "category": "构成",
            "title": "对称构图实验",
            "description": "镜面对称或假对称的构图练习",
            "metadata": {
                "focus": "symmetry",
                "modes": ["mirror", "approximate"],
            },
        },
        {
            "code": "composition-shape-framework",
            "category": "构成",
            "title": "构图挑战",
            "description": "用黄金螺旋、三角形或对称等结构完成构图再添加人物物品",
            "metadata": {
                "focus": "shape-framework",
                "suggested_structures": ["黄金螺旋", "三角形", "对称"],
            },
        },
        {
            "code": "character-prop-resonance",
            "category": "角色设计",
            "title": "道具共鸣",
            "description": "设计能体现角色性格的小物件，或绘制角色的重要饰品特写",
            "metadata": {
                "focus": "character-props",
            },
        },
        {
            "code": "character-age-variation",
            "category": "角色设计",
            "title": "角色年龄化",
            "description": "描绘同一角色的不同年龄阶段",
            "metadata": {
                "focus": "age-variation",
                "milestones": ["童年", "青年", "成年"],
            },
        },
        {
            "code": "character-silhouette-test",
            "category": "角色设计",
            "title": "剪影造型测试",
            "description": "完成人物立绘草稿后修整剪影可读性",
            "metadata": {
                "focus": "silhouette-clarity",
            },
        },
        {
            "code": "character-fusion-ideation",
            "category": "角色设计",
            "title": "联想融合",
            "description": "将两种不相关的元素融合为一体进行角色设计",
            "metadata": {
                "focus": "concept-fusion",
                "suggestions": ["花朵", "机械"],
            },
        },
        {
            "code": "character-hair-wind-study",
            "category": "角色设计",
            "title": "重力与风感",
            "description": "绘制三张不同风向下的发丝走向，注意体积与构成",
            "metadata": {
                "focus": "hair-dynamics",
                "variation_count": 3,
            },
        },
        {
            "code": "character-hairstyle-shapes",
            "category": "角色设计",
            "title": "发型设计挑战",
            "description": "用尖锐、圆润、蓬松等形状语言设计体现性格的发型",
            "metadata": {
                "focus": "hairstyle-language",
                "shape_language": ["尖锐", "圆润", "蓬松"],
            },
        },
        {
            "code": "character-eye-iris-detail",
            "category": "角色设计",
            "title": "心灵之窗",
            "description": "绘制一只眼睛的虹膜细节",
            "metadata": {
                "focus": "eye-detail",
            },
        },
        {
            "code": "character-eye-emotion-contrast",
            "category": "角色设计",
            "title": "情绪表达对比",
            "description": "同一角色的眼睛在不同情绪下的变化对比",
            "metadata": {
                "focus": "eye-expression",
                "emotions": ["喜悦", "愤怒", "悲伤"],
            },
        },
        {
            "code": "character-folds-black-white",
            "category": "角色设计",
            "title": "褶皱类型速记",
            "description": "临摹放射褶与堆积褶，仅用黑白表现褶皱体积",
            "metadata": {
                "focus": "fabric-folds",
                "technique": "black-white",
                "fold_types": ["放射褶", "堆积褶"],
            },
        },
    ]

    category_counters: dict[str, int] = {}
    for preset in data:
        base = category_offsets.get(preset["category"], 500)
        counter = category_counters.get(preset["category"], 0) + 1
        category_counters[preset["category"]] = counter
        preset["display_order"] = base + counter
        preset["is_active"] = True

    return data


def seed_short_term_task_presets(apps, schema_editor):
    del schema_editor  # Unused.

    preset_model = apps.get_model("core", "ShortTermTaskPreset")
    for preset in _presets():
        defaults = {
            "category": preset["category"],
            "title": preset["title"],
            "description": preset["description"],
            "metadata": preset["metadata"],
            "display_order": preset["display_order"],
            "is_active": preset["is_active"],
        }
        preset_model.objects.update_or_create(code=preset["code"], defaults=defaults)


def unseed_short_term_task_presets(apps, schema_editor):
    del schema_editor  # Unused.

    preset_model = apps.get_model("core", "ShortTermTaskPreset")
    codes = [preset["code"] for preset in _presets()]
    preset_model.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0010_userprofile"),
    ]

    operations = [
        migrations.RunPython(
            seed_short_term_task_presets,
            unseed_short_term_task_presets,
        ),
    ]

