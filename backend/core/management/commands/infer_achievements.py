"""
管理命令：历史推断成就解锁记录。

扫描所有用户数据，回填缺失的 UserAchievement 记录。
推断 unlocked_at 基于最早满足条件的日期。
"""
from __future__ import annotations

import logging
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from core.achievement_evaluator import get_evaluator
from core.achievement_unlock import evaluate_or_unlock, infer_unlock_date
from core.models import Achievement, UserAchievement

logger = logging.getLogger(__name__)

User = get_user_model()


class Command(BaseCommand):
    help = "历史推断成就解锁记录：扫描所有用户数据，回填缺失的 UserAchievement 记录"

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id",
            type=int,
            help="仅处理指定用户 ID（用于测试）",
        )
        parser.add_argument(
            "--achievement-id",
            type=int,
            help="仅处理指定成就 ID（用于测试）",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="仅模拟运行，不实际创建记录",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=100,
            help="批处理大小（默认：100）",
        )

    def handle(self, *args, **options):
        user_id = options.get("user_id")
        achievement_id = options.get("achievement_id")
        dry_run = options.get("dry_run", False)
        batch_size = options.get("batch_size", 100)

        self.stdout.write("开始历史推断成就解锁记录...")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN 模式：不会实际创建记录"))

        # 获取要处理的用户和成就
        if user_id:
            users = User.objects.filter(id=user_id)
        else:
            users = User.objects.filter(is_active=True)

        if achievement_id:
            achievements = Achievement.objects.filter(id=achievement_id, is_active=True)
        else:
            achievements = Achievement.objects.filter(is_active=True)

        total_users = users.count()
        total_achievements = achievements.count()
        self.stdout.write(f"用户数: {total_users}, 成就数: {total_achievements}")

        evaluator = get_evaluator()
        stats = {
            "processed_users": 0,
            "processed_achievements": 0,
            "new_unlocks": 0,
            "existing_unlocks": 0,
            "not_met": 0,
            "errors": 0,
        }

        # 批量处理用户
        for user in users.iterator(chunk_size=batch_size):
            stats["processed_users"] += 1
            if stats["processed_users"] % 10 == 0:
                self.stdout.write(
                    f"处理进度: {stats['processed_users']}/{total_users} 用户"
                )

            # 获取用户统计数据（一次性计算，避免重复查询）
            from core.views import _get_user_achievement_stats

            user_stats = _get_user_achievement_stats(user)

            # 处理每个成就
            for achievement in achievements:
                stats["processed_achievements"] += 1

                # 检查是否已解锁
                existing = UserAchievement.objects.filter(
                    user=user, achievement=achievement
                ).first()

                if existing:
                    stats["existing_unlocks"] += 1
                    continue

                # 评估条件
                eval_result = evaluator.evaluate(
                    user,
                    achievement,
                    user_stats=user_stats,
                    log_evaluation=False,
                )

                if not eval_result.matched:
                    stats["not_met"] += 1
                    continue

                # 推断解锁时间
                inferred_date = infer_unlock_date(user, achievement)

                if dry_run:
                    self.stdout.write(
                        f"  [DRY RUN] 将解锁: 用户 {user.id} - 成就 {achievement.slug}"
                        f" (推断时间: {inferred_date.isoformat() if inferred_date else 'N/A'})"
                    )
                    stats["new_unlocks"] += 1
                else:
                    # 创建解锁记录
                    try:
                        unlock_result = evaluate_or_unlock(
                            user,
                            achievement,
                            user_stats=user_stats,
                            provenance=UserAchievement.PROVENANCE_INFERRED,
                            meta={
                                "inferred_date": inferred_date.isoformat()
                                if inferred_date
                                else None,
                                "evaluation_reasons": eval_result.reasons,
                                "metric_values": eval_result.metric_values,
                            },
                        )

                        if unlock_result.unlocked and unlock_result.is_new:
                            stats["new_unlocks"] += 1
                            self.stdout.write(
                                f"  ✓ 解锁: 用户 {user.id} - 成就 {achievement.slug}"
                            )
                        elif unlock_result.unlocked:
                            stats["existing_unlocks"] += 1
                    except Exception as e:
                        stats["errors"] += 1
                        logger.error(
                            f"推断成就解锁失败: 用户 {user.id} - 成就 {achievement.slug}",
                            exc_info=True,
                            extra={
                                "user_id": user.id,
                                "achievement_id": achievement.id,
                                "error": str(e),
                            },
                        )

        # 输出统计信息
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write("处理完成！统计信息：")
        self.stdout.write(f"  处理用户数: {stats['processed_users']}")
        self.stdout.write(f"  处理成就数: {stats['processed_achievements']}")
        self.stdout.write(f"  新解锁记录: {stats['new_unlocks']}")
        self.stdout.write(f"  已存在记录: {stats['existing_unlocks']}")
        self.stdout.write(f"  条件不满足: {stats['not_met']}")
        self.stdout.write(f"  错误数: {stats['errors']}")
        self.stdout.write("=" * 50)

