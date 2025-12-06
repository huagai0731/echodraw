# Generated manually to fix EmailVerification table AUTO_INCREMENT issue

from django.db import migrations


def fix_emailverification_auto_increment(apps, schema_editor):
    """
    修复 EmailVerification 表的 id 字段，确保它是 AUTO_INCREMENT。
    这个问题通常发生在从 SQLite 迁移到 MySQL 时，或者数据库表结构被手动修改后。
    """
    db_alias = schema_editor.connection.alias
    
    # 检查是否是 MySQL 数据库
    if 'mysql' in schema_editor.connection.vendor or 'mariadb' in schema_editor.connection.vendor:
        with schema_editor.connection.cursor() as cursor:
            try:
                # 直接执行修复，不检查（因为检查可能不准确）
                # 如果已经是 AUTO_INCREMENT，这个操作也不会出错
                cursor.execute("""
                    ALTER TABLE `core_emailverification`
                    MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL
                """)
                print("✓ 已修复 core_emailverification 表的 AUTO_INCREMENT")
            except Exception as e:
                # 如果出错，尝试获取详细信息
                print(f"修复 core_emailverification 表时出错: {e}")
                # 检查当前状态
                cursor.execute("""
                    SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'core_emailverification'
                    AND COLUMN_NAME = 'id'
                """)
                result = cursor.fetchone()
                if result:
                    print(f"当前 id 字段状态: {result}")
                raise


def reverse_fix(apps, schema_editor):
    """
    反向操作：理论上不需要，因为 AUTO_INCREMENT 是正常状态
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0083_add_membership_started_at"),
    ]

    operations = [
        migrations.RunPython(
            fix_emailverification_auto_increment,
            reverse_fix,
        ),
    ]

