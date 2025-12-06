"""
创建测试账号的命令。

用法:
    python manage.py create_test_account --email 1065191088@qq.com --password huangming0731
    python manage.py create_test_account --email user@example.com --password pass1234 --display-name "测试用户" --tags "测试,开发"
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction
from core.models import TestAccountProfile

User = get_user_model()


class Command(BaseCommand):
    help = "创建测试账号（包含用户账号和测试账号档案）"

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
            help="账号密码（必填，至少8位，包含字母和数字）",
        )
        parser.add_argument(
            "--display-name",
            type=str,
            default="",
            help="显示昵称（可选，默认为邮箱前缀）",
        )
        parser.add_argument(
            "--tags",
            type=str,
            default="",
            help="标签（可选，逗号分隔，例如：测试,开发）",
        )
        parser.add_argument(
            "--notes",
            type=str,
            default="",
            help="备注信息（可选）",
        )
        parser.add_argument(
            "--inactive",
            action="store_true",
            help="创建为未激活状态（默认是激活的）",
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
        display_name = options["display_name"].strip()
        tags_str = options["tags"].strip()
        notes = options["notes"].strip()
        is_active = not options["inactive"]

        # 验证邮箱格式
        if "@" not in email or "." not in email.split("@")[1]:
            raise CommandError("邮箱格式不正确")

        # 验证密码强度
        is_valid, error_msg = self.validate_password(password)
        if not is_valid:
            raise CommandError(f"密码验证失败: {error_msg}")

        # 检查邮箱是否已存在
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f"邮箱 {email} 已存在，无法创建")

        # 处理标签
        tags = [tag.strip() for tag in tags_str.split(",") if tag.strip()] if tags_str else []

        # 如果没有指定显示昵称，使用邮箱前缀
        if not display_name:
            display_name = email.split("@")[0]

        try:
            with transaction.atomic():
                # 创建用户
                user = User.objects.create_user(
                    username=email,
                    email=email,
                    password=password,
                )
                user.is_active = is_active
                user.save(update_fields=["is_active"])

                # 创建测试账号档案
                profile = TestAccountProfile.objects.create(
                    user=user,
                    display_name=display_name,
                    notes=notes,
                    tags=tags,
                    metadata={},
                )

            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ 测试账号创建成功！\n"
                    f"  邮箱: {email}\n"
                    f"  显示昵称: {display_name}\n"
                    f"  状态: {'激活' if is_active else '未激活'}\n"
                    f"  标签: {', '.join(tags) if tags else '无'}\n"
                    f"  用户ID: {user.id}\n"
                    f"  测试账号档案ID: {profile.id}"
                )
            )
        except Exception as e:
            raise CommandError(f"创建测试账号失败: {str(e)}")

