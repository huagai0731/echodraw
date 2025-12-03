"""
管理命令：批量更新用户统计数据。

定期运行此命令以更新 UserStats 物化表。
建议通过 Celery 定时任务或 cron 定期执行。
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction

from core.models import UserStats
from core.user_stats_cache import get_or_update_for_user, update_for_user

User = get_user_model()


class Command(BaseCommand):
    help = "批量更新用户统计数据"

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id",
            type=int,
            help="仅更新指定用户 ID",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=100,
            help="批处理大小（默认：100）",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="强制更新所有用户（即使最近已更新）",
        )

    def handle(self, *args, **options):
        user_id = options.get("user_id")
        batch_size = options.get("batch_size", 100)
        force = options.get("force", False)

        self.stdout.write("开始更新用户统计数据...")

        if user_id:
            users = User.objects.filter(id=user_id, is_active=True)
        else:
            users = User.objects.filter(is_active=True)

        total_users = users.count()
        self.stdout.write(f"用户数: {total_users}")

        updated_count = 0
        created_count = 0

        for user in users.iterator(chunk_size=batch_size):
            try:
                if force:
                    stats = update_for_user(user)
                else:
                    stats = get_or_update_for_user(user)
                
                if stats.id is None or (hasattr(stats, '_state') and stats._state.adding):
                    created_count += 1
                else:
                    updated_count += 1
                
                if (updated_count + created_count) % 10 == 0:
                    self.stdout.write(
                        f"处理进度: {updated_count + created_count}/{total_users} 用户"
                    )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"更新用户 {user.id} 统计数据失败: {e}")
                )

        self.stdout.write("\n" + "=" * 50)
        self.stdout.write("更新完成！统计信息：")
        self.stdout.write(f"  更新记录数: {updated_count}")
        self.stdout.write(f"  新建记录数: {created_count}")
        self.stdout.write(f"  总计: {updated_count + created_count}")
        self.stdout.write("=" * 50)

