"""
检查 MySQL 数据库的实际 sql_mode 设置
用于诊断 AUTO_INCREMENT 相关问题
"""
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = '检查 MySQL 数据库的实际 sql_mode 设置'

    def handle(self, *args, **options):
        # 检查是否是MySQL数据库
        vendor = connection.vendor
        if vendor not in ['mysql', 'mariadb']:
            self.stdout.write(
                self.style.WARNING(f'当前数据库是 {vendor}，此命令仅适用于MySQL/MariaDB')
            )
            return

        with connection.cursor() as cursor:
            # 检查全局 sql_mode
            cursor.execute("SELECT @@GLOBAL.sql_mode")
            global_sql_mode = cursor.fetchone()[0]
            
            # 检查会话 sql_mode（当前连接）
            cursor.execute("SELECT @@SESSION.sql_mode")
            session_sql_mode = cursor.fetchone()[0]
            
            # 检查当前连接的 sql_mode（实际使用的）
            cursor.execute("SHOW VARIABLES LIKE 'sql_mode'")
            show_result = cursor.fetchone()
            current_sql_mode = show_result[1] if show_result else None
            
            self.stdout.write(self.style.SUCCESS('MySQL sql_mode 检查结果:\n'))
            self.stdout.write(f'全局 sql_mode: {global_sql_mode}')
            self.stdout.write(f'会话 sql_mode: {session_sql_mode}')
            
            # 检查是否包含可能影响 AUTO_INCREMENT 的模式
            problematic_modes = ['STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES']
            found_problematic = []
            
            for mode in problematic_modes:
                if mode in session_sql_mode:
                    found_problematic.append(mode)
            
            if found_problematic:
                self.stdout.write(
                    self.style.WARNING(
                        f'\n⚠ 发现可能影响 AUTO_INCREMENT 的模式: {", ".join(found_problematic)}'
                    )
                )
                self.stdout.write(
                    self.style.WARNING(
                        '建议：确保 sql_mode 包含 NO_AUTO_VALUE_ON_ZERO 或移除 STRICT_TRANS_TABLES'
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS('\n✓ sql_mode 设置看起来正常')
                )

