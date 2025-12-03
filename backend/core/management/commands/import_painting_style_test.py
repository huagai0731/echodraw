"""
导入绘画风格测试数据的管理命令。

使用方法：
    python manage.py import_painting_style_test
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Test, TestDimension, TestQuestion


class Command(BaseCommand):
    help = "导入绘画风格测试数据"

    def handle(self, *args, **options):
        # 解析测试数据
        test_data = self._parse_test_data()
        
        with transaction.atomic():
            # 创建或获取测试对象
            test, created = Test.objects.get_or_create(
                slug="painting-style-assessment",
                defaults={
                    "name": "绘画风格评估",
                    "description": "评估你的绘画创作风格、情绪驱动、稳定性、爆发模式、色彩偏好、构图感知和创作流程偏好。",
                    "test_type": Test.TYPE_1,
                    "is_active": True,
                    "display_order": 1,
                }
            )
            
            if created:
                self.stdout.write(self.style.SUCCESS(f"创建测试: {test.name}"))
            else:
                self.stdout.write(f"使用现有测试: {test.name}")
            
            # 创建维度
            dimensions_map = {}
            for dim_code, dim_info in test_data["dimensions"].items():
                dimension, created = TestDimension.objects.get_or_create(
                    code=dim_code,
                    defaults={
                        "name": dim_info["name"],
                        "endpoint_a_code": dim_info["endpoint_a_code"],
                        "endpoint_a_name": dim_info["endpoint_a_name"],
                        "endpoint_b_code": dim_info["endpoint_b_code"],
                        "endpoint_b_name": dim_info["endpoint_b_name"],
                        "description": dim_info.get("description", ""),
                        "display_order": dim_info.get("display_order", 100),
                    }
                )
                dimensions_map[dim_code] = dimension
                if created:
                    self.stdout.write(self.style.SUCCESS(f"创建维度: {dimension.name}"))
                else:
                    self.stdout.write(f"使用现有维度: {dimension.name}")
            
            # 将维度关联到测试
            test.dimensions.set(dimensions_map.values())
            
            # 创建题目
            question_order = 1
            for question_data in test_data["questions"]:
                endpoint_code = question_data["endpoint_code"]
                dimension_code = question_data["dimension_code"]
                dimension = dimensions_map[dimension_code]
                
                # 确定该题目对应的端点
                if endpoint_code == dimension.endpoint_a_code:
                    endpoint = "a"
                elif endpoint_code == dimension.endpoint_b_code:
                    endpoint = "b"
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f"警告: 题目 '{question_data['text'][:30]}...' 的端点代码 "
                            f"'{endpoint_code}' 不匹配维度 '{dimension_code}' 的端点"
                        )
                    )
                    continue
                
                # 配置分值
                # 非常同意(4) -> 强度2, 比较同意(3) -> 强度1, 中立(2) -> 强度0
                # 比较不同意(1) -> 强度-1, 非常不同意(0) -> 强度-2
                # 如果题目对应端点A，则正向选择（非常同意）给端点A加分
                # 如果题目对应端点B，则正向选择（非常同意）给端点B加分
                score_config = {}
                if endpoint == "a":
                    # 端点A：非常同意(4)对应强度2，给端点A加4分
                    score_config = {
                        "-2": 0,  # 非常不同意 -> 端点A得0分
                        "-1": 1,  # 比较不同意 -> 端点A得1分
                        "0": 2,   # 中立 -> 端点A得2分
                        "1": 3,   # 比较同意 -> 端点A得3分
                        "2": 4,   # 非常同意 -> 端点A得4分
                    }
                else:  # endpoint == "b"
                    # 端点B：非常同意(4)对应强度2，给端点B加4分
                    score_config = {
                        "-2": 4,  # 非常不同意 -> 端点B得4分（反向）
                        "-1": 3,  # 比较不同意 -> 端点B得3分
                        "0": 2,   # 中立 -> 端点B得2分
                        "1": 1,   # 比较同意 -> 端点B得1分
                        "2": 0,   # 非常同意 -> 端点B得0分（反向）
                    }
                
                question, created = TestQuestion.objects.get_or_create(
                    test=test,
                    question_text=question_data["text"],
                    defaults={
                        "dimension": dimension,
                        "endpoint_code": endpoint_code,
                        "score_config": score_config,
                        "display_order": question_order,
                        "is_active": True,
                    }
                )
                
                if created:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"创建题目 {question_order}: {question_data['text'][:40]}..."
                        )
                    )
                else:
                    # 更新现有题目
                    question.dimension = dimension
                    question.endpoint_code = endpoint_code
                    question.score_config = score_config
                    question.display_order = question_order
                    question.is_active = True
                    question.save()
                    self.stdout.write(
                        f"更新题目 {question_order}: {question_data['text'][:40]}..."
                    )
                
                question_order += 1
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"\n成功导入测试数据！共创建/更新 {len(test_data['questions'])} 道题目。"
                )
            )

    def _parse_test_data(self):
        """解析用户提供的测试数据"""
        raw_data = """对我来说，一张画常常是从"这个构成挺有意思"这样的感觉开始的	O1	构成驱动
我喜欢先设计块面或剪影，再去想办法对应地填上内容	O1	构成驱动
我对画面元素关系的排布很敏感，不会画着画着就忘了	O1	构成驱动
有时候路过一个地方的色调或光影很舒服，我就会开始想"如果这是画，会是什么感觉"	O2	氛围驱动
对我来说，一张画通常是从"这个氛围好像可以画"开始的，而不是从角色本身	O2	氛围驱动
你更擅长画氛围感光影或是多层次的画面，画白底立绘或是简单背景感到无从下手	O2	氛围驱动
我动笔的理由经常是"今天的感觉好像需要画点什么"，而不是具体画什么。	M1	情绪驱动
当我的心里出现一种很难讲清的感受时，会想通过画点什么把它固定一下。	M1	情绪驱动
我画面表达的内容和氛围，通常和我当时的心情或者状态相似	M1	情绪驱动
我会突然想到某个角色的状态或某种相处感，然后就想画点与之有关的东西。	M2	故事驱动
有时候脑里闪过一个"像发生了什么"的画面，我会比看到现实的东西更容易开画。	M2	故事驱动
比起精美繁复的画面，我更希望我的画能表达出我想表达的故事或内容	M2	故事驱动
只要我知道自己接下来想练什么，我就能稳定画很久。	T1	规划型稳定
我喜欢给自己设一些小阶段，比如这阵子主攻色彩或人体。	T1	规划型稳定
只要方向明确，我并不会太在意短期的进步快慢。	T1	规划型稳定
画画这件事对我来说会自然周期性出现，不太需要刻意提醒。	T2	节奏型稳定
就算偶尔停一两天，我也会在某个时段又开始想画。	T2	节奏型稳定
长期来看，我的创作节奏大致稳定，不会有太大起伏。	T2	节奏型稳定
一想到要画"像样的东西"，我反而会拖着不敢开始。	B1	压力逃避型爆发
我有时候会因为不想看到自己再画出可笑的东西，而停止画画。	B1	压力逃避型爆发
空白画布会让我紧张，所以我常常拖到某个瞬间才突然开画。	B1	压力逃避型爆发
我经常不是不想画，而是不知道自己现在该画什么。	B2	迷失卡壳型爆发
对我来说，比起画不好，更困扰的是"下一步要练什么"。	B2	迷失卡壳型爆发
我画画经常半途而废，多半是卡在完全不知道"接下来要怎么画"。	B2	迷失卡壳型爆发
你常常会被那种颜色很轻、很干净、明明没涂得很满却感觉完成度够了的画吸住视线。	H1	清透派
比起精致刻画的高完成度画作，你更容易被完成度较低但上色清透的画吸引。	H1	清透派
看到画面有大量留白、柔亮渐层、清淡却干净的色调时，你会忍不住收藏。	H1	清透派
你看到色块明确、饱和度高、对比强烈的画面时，会有种"一眼就记住"的感觉。	H2	大胆派
明亮强色、大面积色面、甚至有点冲击的配色，会让你觉得画很有个性。	H2	大胆派
你对那种整体色调重、超强对比色的画面给人的震撼感很向往。	H2	大胆派
你看图时，会先注意到画面里的方向感，比如线条往哪儿带、画面往哪儿推。	A1	情绪流向型
你常常喜欢那种整体节奏很强的画，像是画里有一股"风"在动。	A1	情绪流向型
当构图有倾斜、旋转、弧线流动时，你通常一下就会被抓住。	A1	情绪流向型
你看到一张图时，会最先注意到画面有没有前后关系、远近层次是不是清楚。	A2	空间层次型
你对空间深度感强、构图结构明晰的作品会特别有好感	A2	空间层次型
你很注重画面里能否明显看出"哪里近、哪里远、东西怎么排"	A2	空间层次型
对我来说，把画面稳定下来比尝试更多变化更重要。	S	严格派
草稿如果已经定型，我通常不会在后续阶段大幅改变内容或构图。	S	严格派
我会觉得"每一步都完成得干净而明确"比"快点看到成品"更让人安心。	S	严格派
我喜欢在动笔前把画的整体结构和步骤先想清楚，不太能接受"画到一半再重来"。	S	严格派
即使草稿很粗，我也不会担心，因为后面随时可以推翻或大改。	F	自由派
我创作时最舒服的状态，就是让画面边发展边决定下一步，而不是照着既定流程走。	F	自由派
对我来说，画面在进行过程中"突然长出新东西"是一种很自然也很有趣的体验。	F	自由派
我经常在画的中段才突然决定"啊，这里换个方向好像更有感觉"然后推翻修改。	F	自由派"""
        
        questions = []
        dimension_codes = set()
        
        for line in raw_data.strip().split("\n"):
            parts = line.split("\t")
            if len(parts) >= 3:
                text = parts[0].strip()
                code = parts[1].strip()
                type_name = parts[2].strip()
                
                # 提取维度代码（去掉数字）
                # 特殊情况：S和F本身就是维度代码
                if code in ("S", "F"):
                    dimension_code = "S"  # S和F属于同一个维度
                else:
                    dimension_code = code.rstrip("0123456789")
                dimension_codes.add(dimension_code)
                
                questions.append({
                    "text": text,
                    "endpoint_code": code,
                    "dimension_code": dimension_code,
                    "type_name": type_name,
                })
        
        # 创建维度映射
        dimensions = {}
        dimension_pairs = {
            "O": ("O1", "O2", "构成驱动", "氛围驱动", "创作起点偏好"),
            "M": ("M1", "M2", "情绪驱动", "故事驱动", "创作动机偏好"),
            "T": ("T1", "T2", "规划型稳定", "节奏型稳定", "创作稳定性模式"),
            "B": ("B1", "B2", "压力逃避型爆发", "迷失卡壳型爆发", "创作爆发模式"),
            "H": ("H1", "H2", "清透派", "大胆派", "色彩偏好"),
            "A": ("A1", "A2", "情绪流向型", "空间层次型", "构图感知偏好"),
            "S": ("S", "F", "严格派", "自由派", "创作流程偏好"),
        }
        
        display_order = 1
        for dim_code, (endpoint_a, endpoint_b, name_a, name_b, dim_name) in dimension_pairs.items():
            dimensions[dim_code] = {
                "name": dim_name,
                "endpoint_a_code": endpoint_a,
                "endpoint_a_name": name_a,
                "endpoint_b_code": endpoint_b,
                "endpoint_b_name": name_b,
                "description": f"评估你在{dim_name}维度上的倾向，从{name_a}到{name_b}。",
                "display_order": display_order,
            }
            display_order += 1
        
        return {
            "dimensions": dimensions,
            "questions": questions,
        }

