"""
清理过期的认证相关记录，防止数据库表无限增长。

建议通过cron或定时任务定期执行（例如每小时或每天）：
- Linux/Mac: 0 * * * * cd /path/to/project && python manage.py cleanup_auth_records
- Windows: 使用任务计划程序

对于高并发场景（每日1万+用户），建议每小时执行一次。
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from core.models import EmailVerification, LoginAttempt


class Command(BaseCommand):
    help = "清理过期的EmailVerification和LoginAttempt记录，防止数据库表无限增长"

    def add_arguments(self, parser):
        parser.add_argument(
            "--verification-days",
            type=int,
            default=7,
            help="删除多少天前的验证码记录（默认：7天）",
        )
        parser.add_argument(
            "--login-attempt-days",
            type=int,
            default=30,
            help="删除多少天前的登录尝试记录（默认：30天）",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="仅显示将要删除的记录数量，不实际删除",
        )

    def handle(self, *args, **options):
        now = timezone.now()
        verification_days = options["verification_days"]
        login_attempt_days = options["login_attempt_days"]
        dry_run = options["dry_run"]

        # 计算截止日期
        verification_cutoff = now - timedelta(days=verification_days)
        login_cutoff = now - timedelta(days=login_attempt_days)

        # 统计要删除的记录数
        verification_count = EmailVerification.objects.filter(
            created_at__lt=verification_cutoff
        ).count()

        login_attempt_count = LoginAttempt.objects.filter(
            created_at__lt=login_cutoff
        ).count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] 将删除："
                    f"\n  - {verification_count} 条验证码记录（{verification_days}天前）"
                    f"\n  - {login_attempt_count} 条登录尝试记录（{login_attempt_days}天前）"
                )
            )
            return

        # 删除过期的验证码记录
        deleted_verifications = EmailVerification.objects.filter(
            created_at__lt=verification_cutoff
        ).delete()

        # 删除过期的登录尝试记录
        deleted_attempts = LoginAttempt.objects.filter(
            created_at__lt=login_cutoff
        ).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"清理完成："
                f"\n  - 删除 {deleted_verifications[0]} 条验证码记录（{verification_days}天前）"
                f"\n  - 删除 {deleted_attempts[0]} 条登录尝试记录（{login_attempt_days}天前）"
            )
        )

