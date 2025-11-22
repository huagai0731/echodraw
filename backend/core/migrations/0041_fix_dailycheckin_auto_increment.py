# Generated manually to fix DailyCheckIn table AUTO_INCREMENT issue

from django.db import migrations


def fix_dailycheckin_auto_increment(apps, schema_editor):
    """
    修复 DailyCheckIn 表的 id 字段，确保它是 AUTO_INCREMENT。
    这个问题通常发生在从 SQLite 迁移到 MySQL 时。
    """
    db_alias = schema_editor.connection.alias
    
    # 检查是否是 MySQL 数据库
    if 'mysql' in schema_editor.connection.vendor or 'mariadb' in schema_editor.connection.vendor:
        with schema_editor.connection.cursor() as cursor:
            # 获取当前表结构
            cursor.execute("""
                SELECT COLUMN_TYPE, EXTRA
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'core_dailycheckin'
                AND COLUMN_NAME = 'id'
            """)
            result = cursor.fetchone()
            
            if result:
                column_type, extra = result
                # 检查是否已经是 AUTO_INCREMENT
                if 'auto_increment' not in extra.lower():
                    # 修复表结构，确保 id 字段是 AUTO_INCREMENT
                    cursor.execute("""
                        ALTER TABLE `core_dailycheckin`
                        MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL
                    """)


def reverse_fix(apps, schema_editor):
    """
    反向操作：理论上不需要，因为 AUTO_INCREMENT 是正常状态
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0040_highfiveclick"),
    ]

    operations = [
        migrations.RunPython(
            fix_dailycheckin_auto_increment,
            reverse_fix,
        ),
    ]







