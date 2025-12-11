#!/usr/bin/env python
"""
数据库迁移确保脚本
自动检查并应用所有未应用的迁移，确保数据库结构与模型一致。

使用方法:
    python ensure_migrations.py

功能:
    1. 检查所有未应用的迁移
    2. 自动应用迁移
    3. 检查数据库表结构是否与模型一致
    4. 报告任何不一致的地方
"""

import os
import sys
import django
from django.core.management import call_command
from django.db import connection
from django.apps import apps

# 设置Django环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()


def check_migration_status():
    """检查迁移状态"""
    print("=" * 60)
    print("检查迁移状态...")
    print("=" * 60)
    
    try:
        # 获取未应用的迁移
        from django.db.migrations.executor import MigrationExecutor
        from django.db import connection
        
        executor = MigrationExecutor(connection)
        plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
        
        if plan:
            print(f"\n发现 {len(plan)} 个未应用的迁移:")
            for migration, backwards in plan:
                print(f"  - {migration.app_label}.{migration.name}")
            return False
        else:
            print("\n✓ 所有迁移已应用")
            return True
    except Exception as e:
        print(f"\n✗ 检查迁移状态时出错: {e}")
        return False


def apply_migrations():
    """应用所有迁移"""
    print("\n" + "=" * 60)
    print("应用迁移...")
    print("=" * 60)
    
    try:
        call_command("migrate", verbosity=2, interactive=False)
        print("\n✓ 迁移应用完成")
        return True
    except Exception as e:
        print(f"\n✗ 应用迁移时出错: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_table_structure():
    """检查数据库表结构是否与模型一致"""
    print("\n" + "=" * 60)
    print("检查数据库表结构...")
    print("=" * 60)
    
    issues = []
    
    with connection.cursor() as cursor:
        # 获取所有已安装的模型
        for app_config in apps.get_app_configs():
            for model in app_config.get_models():
                table_name = model._meta.db_table
                
                # 检查表是否存在
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = DATABASE() 
                    AND table_name = %s
                """, [table_name])
                
                table_exists = cursor.fetchone()[0] > 0
                
                if not table_exists:
                    issues.append(f"表 {table_name} 不存在")
                    continue
                
                # 获取数据库中的列
                cursor.execute("""
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = %s
                """, [table_name])
                
                db_columns = {row[0]: row for row in cursor.fetchall()}
                
                # 检查模型字段
                for field in model._meta.get_fields():
                    if hasattr(field, 'column'):
                        field_name = field.column
                        
                        if field_name not in db_columns:
                            issues.append(
                                f"表 {table_name} 缺少字段 {field_name} "
                                f"(模型: {model.__name__})"
                            )
    
    if issues:
        print(f"\n发现 {len(issues)} 个结构问题:")
        for issue in issues:
            print(f"  ✗ {issue}")
        return False
    else:
        print("\n✓ 数据库表结构检查通过")
        return True


def fix_missing_fields():
    """尝试修复缺失的字段（通过运行迁移）"""
    print("\n" + "=" * 60)
    print("尝试修复缺失字段...")
    print("=" * 60)
    
    # 先检查迁移状态
    if not check_migration_status():
        print("\n发现未应用的迁移，正在应用...")
        if apply_migrations():
            print("\n✓ 迁移已应用，请重新检查表结构")
            return True
        else:
            print("\n✗ 迁移应用失败")
            return False
    else:
        print("\n所有迁移已应用，但仍有结构问题")
        print("建议: 检查是否有迁移文件缺失或需要手动修复")
        return False


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("数据库迁移确保脚本")
    print("=" * 60)
    
    # 步骤1: 检查迁移状态
    migrations_ok = check_migration_status()
    
    # 步骤2: 如果有未应用的迁移，应用它们
    if not migrations_ok:
        if not apply_migrations():
            print("\n✗ 迁移应用失败，请检查错误信息")
            sys.exit(1)
    
    # 步骤3: 检查表结构
    structure_ok = check_table_structure()
    
    # 步骤4: 如果有结构问题，尝试修复
    if not structure_ok:
        print("\n" + "=" * 60)
        print("尝试修复...")
        print("=" * 60)
        if not fix_missing_fields():
            print("\n" + "=" * 60)
            print("修复失败")
            print("=" * 60)
            print("\n建议:")
            print("1. 检查是否有新的迁移文件需要创建")
            print("2. 运行: python manage.py makemigrations")
            print("3. 运行: python manage.py migrate")
            print("4. 如果问题仍然存在，可能需要手动修复数据库")
            sys.exit(1)
        else:
            # 重新检查结构
            structure_ok = check_table_structure()
    
    # 最终报告
    print("\n" + "=" * 60)
    if migrations_ok and structure_ok:
        print("✓ 所有检查通过！数据库结构正常")
        print("=" * 60)
        sys.exit(0)
    else:
        print("✗ 仍有问题需要解决")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    main()










