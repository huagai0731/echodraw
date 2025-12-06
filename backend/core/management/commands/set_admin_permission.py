"""
设置账号为管理员权限的命令。

用法:
    python manage.py set_admin_permission --email 1065191088@qq.com
    python manage.py set_admin_permission --email 1065191088@qq.com --remove  # 移除管理员权限
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = "设置或移除账号的管理员权限（is_staff）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            required=True,
            help="账号邮箱（必填）",
        )
        parser.add_argument(
            "--remove",
            action="store_true",
            help="移除管理员权限（默认是添加）",
        )

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        remove = options["remove"]

        # 验证邮箱格式
        if "@" not in email or "." not in email.split("@")[1]:
            raise CommandError("邮箱格式不正确")

        # 查找用户
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise CommandError(f"邮箱 {email} 对应的账号不存在")

        try:
            # 设置或移除管理员权限
            if remove:
                user.is_staff = False
                action = "移除"
                status_text = "普通用户"
            else:
                user.is_staff = True
                action = "添加"
                status_text = "管理员"

            user.save(update_fields=["is_staff"])

            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ {action}管理员权限成功！\n"
                    f"  邮箱: {email}\n"
                    f"  用户ID: {user.id}\n"
                    f"  当前状态: {status_text}\n"
                    f"  账号状态: {'激活' if user.is_active else '未激活'}"
                )
            )
        except Exception as e:
            raise CommandError(f"{action}管理员权限失败: {str(e)}")

