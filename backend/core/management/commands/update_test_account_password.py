"""
修改测试账号密码的命令。

用法:
    python manage.py update_test_account_password --email 1065191088@qq.com --password newpassword123
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = "修改测试账号的密码"

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            required=True,
            help="账号邮箱（必填）",
        )
        parser.add_argument(
            "--password",
            type=str,
            required=True,
            help="新密码（必填，至少8位，包含字母和数字）",
        )

    def validate_password(self, password: str) -> tuple[bool, str]:
        """验证密码强度"""
        if len(password) < 8:
            return False, "密码长度至少 8 位"
        
        has_digit = any(c.isdigit() for c in password)
        has_letter = any(c.isalpha() for c in password)
        
        if not has_digit:
            return False, "密码必须包含至少一个数字"
        
        if not has_letter:
            return False, "密码必须包含至少一个字母"
        
        return True, ""

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        password = options["password"]

        # 验证邮箱格式
        if "@" not in email or "." not in email.split("@")[1]:
            raise CommandError("邮箱格式不正确")

        # 验证密码强度
        is_valid, error_msg = self.validate_password(password)
        if not is_valid:
            raise CommandError(f"密码验证失败: {error_msg}")

        # 查找用户
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise CommandError(f"邮箱 {email} 对应的账号不存在")

        try:
            # 更新密码
            user.set_password(password)
            user.save(update_fields=["password"])

            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ 密码修改成功！\n"
                    f"  邮箱: {email}\n"
                    f"  用户ID: {user.id}\n"
                    f"  账号状态: {'激活' if user.is_active else '未激活'}"
                )
            )
        except Exception as e:
            raise CommandError(f"修改密码失败: {str(e)}")

