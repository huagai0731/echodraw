# Generated manually to fix UserUpload and ShortTermGoal tables AUTO_INCREMENT issue

from django.db import migrations


def fix_auto_increment(apps, schema_editor):
    """
    修复 UserUpload 和 ShortTermGoal 表的 id 字段，确保它们是 AUTO_INCREMENT。
    这个问题通常发生在从 SQLite 迁移到 MySQL 时，或者数据库表结构被手动修改后。
    """
    db_alias = schema_editor.connection.alias
    
    # 检查是否是 MySQL 数据库
    if 'mysql' in schema_editor.connection.vendor or 'mariadb' in schema_editor.connection.vendor:
        with schema_editor.connection.cursor() as cursor:
            try:
                # 修复 core_userupload 表
                cursor.execute("""
                    ALTER TABLE `core_userupload`
                    MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL
                """)
                print("✓ 已修复 core_userupload 表的 AUTO_INCREMENT")
            except Exception as e:
                print(f"修复 core_userupload 表时出错: {e}")
                # 检查当前状态
                cursor.execute("""
                    SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'core_userupload'
                    AND COLUMN_NAME = 'id'
                """)
                result = cursor.fetchone()
                if result:
                    print(f"当前 core_userupload.id 字段状态: {result}")
                raise
            
            try:
                # 修复 core_shorttermgoal 表
                cursor.execute("""
                    ALTER TABLE `core_shorttermgoal`
                    MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL
                """)
                print("✓ 已修复 core_shorttermgoal 表的 AUTO_INCREMENT")
            except Exception as e:
                print(f"修复 core_shorttermgoal 表时出错: {e}")
                # 检查当前状态
                cursor.execute("""
                    SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'core_shorttermgoal'
                    AND COLUMN_NAME = 'id'
                """)
                result = cursor.fetchone()
                if result:
                    print(f"当前 core_shorttermgoal.id 字段状态: {result}")
                raise


def reverse_fix(apps, schema_editor):
    """
    反向操作：理论上不需要，因为 AUTO_INCREMENT 是正常状态
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0088_increase_current_month_max_length"),
    ]

    operations = [
        migrations.RunPython(
            fix_auto_increment,
            reverse_fix,
        ),
    ]

