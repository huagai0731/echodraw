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
            tables_to_fix = [
                ('core_userupload', 'UserUpload'),
                ('core_shorttermgoal', 'ShortTermGoal'),
            ]
            
            for table_name, model_name in tables_to_fix:
                try:
                    # 先检查当前状态
                    cursor.execute("""
                        SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                        AND TABLE_NAME = %s
                        AND COLUMN_NAME = 'id'
                    """, [table_name])
                    
                    result = cursor.fetchone()
                    if not result:
                        print(f"⚠  {table_name} 表不存在或没有id字段，跳过")
                        continue
                    
                    column_type, extra, is_nullable = result
                    has_auto_increment = 'auto_increment' in extra.lower() if extra else False
                    
                    if has_auto_increment:
                        print(f"✓ {table_name} 表的 AUTO_INCREMENT 已正确设置，无需修复")
                        continue
                    
                    # 修复表
                    cursor.execute(f"""
                        ALTER TABLE `{table_name}`
                        MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL
                    """)
                    print(f"✓ 已修复 {table_name} ({model_name}) 表的 AUTO_INCREMENT")
                    
                except Exception as e:
                    print(f"✗ 修复 {table_name} ({model_name}) 表时出错: {e}")
                    # 检查当前状态以便调试
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
                            print(f"   当前 {table_name}.id 字段状态: {result}")
                    except:
                        pass
                    # 不抛出异常，继续修复其他表
                    print(f"   跳过 {table_name}，继续修复其他表...")


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

