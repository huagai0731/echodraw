"""
测试用户创建功能，用于诊断 AUTO_INCREMENT 问题
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import connection, transaction
import secrets


class Command(BaseCommand):
    help = '测试用户创建功能，用于诊断 AUTO_INCREMENT 问题'

    def handle(self, *args, **options):
        user_model = get_user_model()
        
        # 检查数据库连接
        vendor = connection.vendor
        self.stdout.write(f'数据库类型: {vendor}')
        
        if vendor in ['mysql', 'mariadb']:
            with connection.cursor() as cursor:
                cursor.execute("SELECT @@SESSION.sql_mode")
                sql_mode = cursor.fetchone()[0]
                self.stdout.write(f'当前会话 sql_mode: {sql_mode}')
                
                # 检查 auth_user 表结构
                cursor.execute("""
                    SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'auth_user'
                    AND COLUMN_NAME = 'id'
                """)
                result = cursor.fetchone()
                if result:
                    column_type, extra, is_nullable = result
                    self.stdout.write(f'auth_user.id 字段:')
                    self.stdout.write(f'  类型: {column_type}')
                    self.stdout.write(f'  EXTRA: {extra or "N/A"}')
                    self.stdout.write(f'  可空: {is_nullable}')
        
        self.stdout.write('\n尝试创建测试用户...')
        
        # 生成唯一的测试邮箱
        test_email = f'test_{secrets.token_hex(4)}@test.com'
        test_password = 'TestPassword123!'
        
        try:
            with transaction.atomic():
                # 尝试创建用户
                user = user_model.objects.create_user(
                    username=test_email,
                    email=test_email,
                    password=test_password,
                )
                self.stdout.write(
                    self.style.SUCCESS(f'✓ 成功创建用户: {user.email} (ID: {user.id})')
                )
                
                # 清理测试用户
                user.delete()
                self.stdout.write('✓ 已清理测试用户')
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'✗ 创建用户失败: {e}')
            )
            import traceback
            self.stdout.write(traceback.format_exc())

