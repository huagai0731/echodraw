"""
修复 auth_user 表的 id 字段 AUTO_INCREMENT 问题
用于解决 MySQL 数据库中 "Field 'id' doesn't have a default value" 错误
"""
from django.core.management.base import BaseCommand
from django.db import connection
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = '修复 auth_user 表的 id 字段 AUTO_INCREMENT 问题'

    def add_arguments(self, parser):
        parser.add_argument(
            '--check-only',
            action='store_true',
            help='仅检查状态，不执行修复',
        )

    def handle(self, *args, **options):
        # 检查是否是MySQL数据库
        vendor = connection.vendor
        if vendor not in ['mysql', 'mariadb']:
            self.stdout.write(
                self.style.WARNING(f'当前数据库是 {vendor}，此命令仅适用于MySQL/MariaDB')
            )
            return

        user_model = get_user_model()
        table_name = user_model._meta.db_table
        
        self.stdout.write(f'检查表: {table_name}\n')

        with connection.cursor() as cursor:
            try:
                # 检查当前状态
                cursor.execute("""
                    SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE, COLUMN_KEY
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = %s
                    AND COLUMN_NAME = 'id'
                """, [table_name])
                
                result = cursor.fetchone()
                
                if not result:
                    self.stdout.write(
                        self.style.ERROR(f'✗ {table_name} 表不存在或没有id字段')
                    )
                    return
                
                column_type, extra, is_nullable, column_key = result
                has_auto_increment = 'auto_increment' in extra.lower() if extra else False
                
                self.stdout.write(f'当前状态:')
                self.stdout.write(f'  类型: {column_type}')
                self.stdout.write(f'  EXTRA: {extra or "N/A"}')
                self.stdout.write(f'  可空: {is_nullable}')
                self.stdout.write(f'  主键: {column_key or "N/A"}')
                self.stdout.write(f'  AUTO_INCREMENT: {"是" if has_auto_increment else "否"}\n')
                
                if has_auto_increment:
                    self.stdout.write(
                        self.style.SUCCESS(f'✓ {table_name} 表的 AUTO_INCREMENT 已正确设置，无需修复')
                    )
                    return
                
                if options['check_only']:
                    self.stdout.write(
                        self.style.WARNING(f'⚠ {table_name} 表需要修复 AUTO_INCREMENT')
                    )
                    self.stdout.write(
                        self.style.WARNING('运行此命令时不使用 --check-only 选项来执行修复')
                    )
                    return
                
                # 执行修复
                self.stdout.write(f'开始修复 {table_name} 表...')
                
                # 根据字段类型确定修复SQL
                if 'bigint' in column_type.lower():
                    modify_sql = f"ALTER TABLE `{table_name}` MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL"
                elif 'int' in column_type.lower():
                    modify_sql = f"ALTER TABLE `{table_name}` MODIFY COLUMN `id` INT AUTO_INCREMENT NOT NULL"
                else:
                    # 默认使用 BIGINT
                    modify_sql = f"ALTER TABLE `{table_name}` MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL"
                
                cursor.execute(modify_sql)
                
                # 再次检查确认
                cursor.execute("""
                    SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = %s
                    AND COLUMN_NAME = 'id'
                """, [table_name])
                
                result = cursor.fetchone()
                if result:
                    _, new_extra, _ = result
                    new_has_auto_increment = 'auto_increment' in new_extra.lower() if new_extra else False
                    
                    if new_has_auto_increment:
                        self.stdout.write(
                            self.style.SUCCESS(f'✓ 已成功修复 {table_name} 表的 AUTO_INCREMENT')
                        )
                    else:
                        self.stdout.write(
                            self.style.ERROR(f'✗ 修复失败，AUTO_INCREMENT 仍未设置')
                        )
                
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'✗ 修复 {table_name} 表时出错: {e}')
                )
                # 显示当前状态以便调试
                try:
                    cursor.execute("""
                        SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                        AND TABLE_NAME = %s
                        AND COLUMN_NAME = 'id'
                    """, [table_name])
                    result = cursor.fetchone()
                    if result:
                        self.stdout.write(f'   当前 id 字段状态: {result}')
                except:
                    pass
                raise

