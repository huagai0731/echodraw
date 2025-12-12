#!/usr/bin/env python
"""
部署前检查脚本
在部署到生产环境前，检查所有必要的配置和数据库状态。

使用方法:
    python deploy_check.py

功能:
    1. 检查环境变量配置
    2. 检查数据库连接
    3. 检查迁移状态
    4. 检查数据库结构
    5. 提供修复建议
"""

import os
import sys
import django
from django.core.management import call_command
from django.db import connection
from django.conf import settings

# 设置Django环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()


def check_environment():
    """检查环境变量"""
    print("=" * 60)
    print("检查环境变量...")
    print("=" * 60)
    
    issues = []
    warnings = []
    
    # 检查必要的环境变量
    required_vars = {
        'DJANGO_SECRET_KEY': 'Django密钥',
        'DJANGO_ALLOWED_HOSTS': '允许的主机列表',
    }
    
    for var, desc in required_vars.items():
        if not os.getenv(var):
            issues.append(f"缺少环境变量: {var} ({desc})")
    
    # 检查数据库配置
    db_vars = {
        'DB_NAME': '数据库名称',
        'DB_USER': '数据库用户',
        'DB_PASSWORD': '数据库密码',
        'DB_HOST': '数据库主机',
    }
    
    for var, desc in db_vars.items():
        if not os.getenv(var):
            issues.append(f"缺少数据库环境变量: {var} ({desc})")
    
    # 检查可选但重要的变量
    optional_vars = {
        'USE_TOS_STORAGE': 'TOS存储配置',
        'TOS_ACCESS_KEY': 'TOS访问密钥',
        'TOS_SECRET_KEY': 'TOS密钥',
    }
    
    for var, desc in optional_vars.items():
        if not os.getenv(var):
            warnings.append(f"未设置环境变量: {var} ({desc}) - 某些功能可能不可用")
    
    if issues:
        print("\n✗ 发现关键问题:")
        for issue in issues:
            print(f"  - {issue}")
        return False
    
    if warnings:
        print("\n⚠ 警告:")
        for warning in warnings:
            print(f"  - {warning}")
    
    print("\n✓ 环境变量检查通过")
    return True


def check_database_connection():
    """检查数据库连接"""
    print("\n" + "=" * 60)
    print("检查数据库连接...")
    print("=" * 60)
    
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            if result:
                print("✓ 数据库连接正常")
                return True
            else:
                print("✗ 数据库连接异常")
                return False
    except Exception as e:
        print(f"✗ 数据库连接失败: {e}")
        return False


def check_migrations():
    """检查迁移状态"""
    print("\n" + "=" * 60)
    print("检查迁移状态...")
    print("=" * 60)
    
    try:
        from django.db.migrations.executor import MigrationExecutor
        
        executor = MigrationExecutor(connection)
        plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
        
        if plan:
            print(f"\n✗ 发现 {len(plan)} 个未应用的迁移:")
            for migration, backwards in plan:
                print(f"  - {migration.app_label}.{migration.name}")
            return False
        else:
            print("\n✓ 所有迁移已应用")
            return True
    except Exception as e:
        print(f"\n✗ 检查迁移状态时出错: {e}")
        return False


def check_critical_tables():
    """检查关键表是否存在"""
    print("\n" + "=" * 60)
    print("检查关键表...")
    print("=" * 60)
    
    critical_tables = [
        'core_userupload',
        'core_emailverification',
        'core_authtoken',
        'auth_user',
    ]
    
    issues = []
    
    with connection.cursor() as cursor:
        for table in critical_tables:
            cursor.execute("""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = %s
            """, [table])
            
            exists = cursor.fetchone()[0] > 0
            if not exists:
                issues.append(table)
                print(f"  ✗ 表 {table} 不存在")
            else:
                print(f"  ✓ 表 {table} 存在")
    
    if issues:
        print(f"\n✗ 发现 {len(issues)} 个缺失的关键表")
        return False
    else:
        print("\n✓ 所有关键表存在")
        return True


def check_critical_fields():
    """检查关键字段是否存在"""
    print("\n" + "=" * 60)
    print("检查关键字段...")
    print("=" * 60)
    
    # 检查 UserUpload.thumbnail 字段
    from core.models import UserUpload
    
    table_name = UserUpload._meta.db_table
    field_name = 'thumbnail'
    
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT COUNT(*) 
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = %s
            AND COLUMN_NAME = %s
        """, [table_name, field_name])
        
        exists = cursor.fetchone()[0] > 0
        
        if exists:
            print(f"  ✓ 字段 {table_name}.{field_name} 存在")
            return True
        else:
            print(f"  ✗ 字段 {table_name}.{field_name} 不存在")
            print("\n建议:")
            print("  1. 运行: python manage.py migrate")
            print("  2. 或运行: python fix_database_structure.py")
            return False


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("部署前检查脚本")
    print("=" * 60)
    
    checks = [
        ("环境变量", check_environment),
        ("数据库连接", check_database_connection),
        ("迁移状态", check_migrations),
        ("关键表", check_critical_tables),
        ("关键字段", check_critical_fields),
    ]
    
    results = []
    
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n✗ 检查 {name} 时出错: {e}")
            results.append((name, False))
    
    # 总结
    print("\n" + "=" * 60)
    print("检查总结")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"  {status}: {name}")
    
    print(f"\n通过: {passed}/{total}")
    
    if passed == total:
        print("\n✓ 所有检查通过，可以部署！")
        sys.exit(0)
    else:
        print("\n✗ 部分检查失败，请修复后再部署")
        print("\n修复建议:")
        print("  1. 运行: python ensure_migrations.py")
        print("  2. 运行: python fix_database_structure.py")
        print("  3. 检查环境变量配置")
        sys.exit(1)


if __name__ == "__main__":
    main()











