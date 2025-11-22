#!/usr/bin/env python3
"""
自动修复迁移冲突脚本
检测已存在的表/字段，自动标记对应的迁移为已应用（fake）
"""
import os
import sys
import django
from django.core.management import execute_from_command_line
from django.db import connection

# 设置 Django 环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db.migrations.loader import MigrationLoader
from django.apps import apps


def check_table_exists(table_name):
    """检查表是否存在"""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = %s
            """,
            [table_name]
        )
        return cursor.fetchone()[0] > 0


def check_column_exists(table_name, column_name):
    """检查字段是否存在"""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) 
            FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = %s 
            AND column_name = %s
            """,
            [table_name, column_name]
        )
        return cursor.fetchone()[0] > 0


def get_table_name_for_model(model_name):
    """获取模型对应的数据库表名"""
    try:
        model = apps.get_model("core", model_name)
        return model._meta.db_table
    except LookupError:
        return None


def analyze_migration_operations(migration):
    """分析迁移操作，返回需要检查的表和字段"""
    tables_to_check = []
    fields_to_check = []
    
    for operation in migration.operations:
        # 检查 CreateModel 操作
        if hasattr(operation, 'name'):
            if hasattr(operation, 'fields'):  # CreateModel
                model_name = operation.name.lower()
                table_name = get_table_name_for_model(operation.name)
                if table_name:
                    tables_to_check.append((table_name, migration.name))
        
        # 检查 AddField 操作
        if hasattr(operation, 'model_name') and hasattr(operation, 'name'):
            if operation.__class__.__name__ == 'AddField':
                model_name = operation.model_name.lower()
                table_name = get_table_name_for_model(operation.model_name)
                field_name = operation.name
                if table_name:
                    fields_to_check.append((table_name, field_name, migration.name))
        
        # 检查 AlterField 操作（通常字段已存在，只是修改属性）
        if hasattr(operation, 'model_name') and hasattr(operation, 'name'):
            if operation.__class__.__name__ == 'AlterField':
                model_name = operation.model_name.lower()
                table_name = get_table_name_for_model(operation.model_name)
                field_name = operation.name
                if table_name:
                    # AlterField 意味着字段已存在，只需要检查字段是否存在
                    fields_to_check.append((table_name, field_name, migration.name))
    
    return tables_to_check, fields_to_check


def main():
    print("=" * 60)
    print("自动修复迁移冲突")
    print("=" * 60)
    print()
    
    # 加载迁移
    loader = MigrationLoader(connection)
    app_name = "core"
    
    # 获取未应用的迁移
    applied = loader.applied_migrations
    all_migrations = loader.graph.nodes
    
    # 获取 core app 的未应用迁移
    unapplied = []
    for migration_key in all_migrations:
        if migration_key[0] == app_name and migration_key not in applied:
            unapplied.append(migration_key)
    
    if not unapplied:
        print("✅ 所有迁移都已应用，无需修复")
        return
    
    print(f"发现 {len(unapplied)} 个未应用的迁移")
    print()
    
    # 需要 fake 的迁移列表
    migrations_to_fake = []
    
    # 检查每个未应用的迁移
    for app_label, migration_name in sorted(unapplied):
        migration = loader.graph.nodes[(app_label, migration_name)]
        
        tables_to_check, fields_to_check = analyze_migration_operations(migration)
        
        should_fake = False
        reasons = []
        
        # 检查表是否存在
        for table_name, _ in tables_to_check:
            if check_table_exists(table_name):
                should_fake = True
                reasons.append(f"表 {table_name} 已存在")
        
        # 检查字段是否存在
        for table_name, field_name, _ in fields_to_check:
            if check_column_exists(table_name, field_name):
                should_fake = True
                reasons.append(f"字段 {table_name}.{field_name} 已存在")
        
        if should_fake:
            migrations_to_fake.append((migration_name, reasons))
            print(f"⚠️  {migration_name}")
            for reason in reasons:
                print(f"   - {reason}")
            print(f"   → 将标记为已应用（fake）")
            print()
    
    if not migrations_to_fake:
        print("✅ 未发现需要 fake 的迁移，可以正常运行迁移")
        print()
        print("运行迁移...")
        execute_from_command_line(["manage.py", "migrate"])
        return
    
    # 批量 fake 迁移
    print(f"\n准备标记 {len(migrations_to_fake)} 个迁移为已应用...")
    print()
    
    for migration_name, reasons in migrations_to_fake:
        print(f"标记 {migration_name} 为已应用...")
        try:
            execute_from_command_line([
                "manage.py", 
                "migrate", 
                "--fake", 
                app_name, 
                migration_name
            ])
            print(f"✅ {migration_name} 已标记")
        except Exception as e:
            print(f"❌ 标记 {migration_name} 失败: {e}")
        print()
    
    # 运行剩余迁移
    print("=" * 60)
    print("运行剩余迁移...")
    print("=" * 60)
    print()
    
    try:
        execute_from_command_line(["manage.py", "migrate"])
        print()
        print("✅ 迁移完成！")
    except Exception as e:
        print()
        print(f"❌ 迁移失败: {e}")
        print()
        print("请检查错误信息并手动处理")
        sys.exit(1)
    
    # 显示最终状态
    print()
    print("=" * 60)
    print("最终迁移状态:")
    print("=" * 60)
    execute_from_command_line(["manage.py", "showmigrations", app_name])


if __name__ == "__main__":
    main()





