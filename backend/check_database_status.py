#!/usr/bin/env python
"""
检查数据库连接状态和数据情况
"""
import os
import sys
from pathlib import Path

# 设置项目路径
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# 加载环境变量
from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".env.local", override=True)

# 设置 Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

print("=" * 60)
print("数据库状态检查")
print("=" * 60)
print()

# 显示配置信息
db_config = settings.DATABASES['default']
print("数据库配置:")
print(f"  引擎: {db_config.get('ENGINE', 'N/A')}")
print(f"  主机: {db_config.get('HOST', 'N/A')}")
print(f"  端口: {db_config.get('PORT', 'N/A')}")
print(f"  数据库名: {db_config.get('NAME', 'N/A')}")
print(f"  用户名: {db_config.get('USER', 'N/A')}")
print(f"  密码: {'***已设置' if db_config.get('PASSWORD') else '✗ 未设置'}")
print()

# 检查 SQLite 文件是否存在（可能还有旧数据）
sqlite_path = BASE_DIR / "db.sqlite3"
if sqlite_path.exists():
    size = sqlite_path.stat().st_size
    print(f"⚠️  发现 SQLite 数据库文件: {sqlite_path}")
    print(f"   文件大小: {size / 1024 / 1024:.2f} MB")
    print(f"   提示: 如果 MySQL 数据库为空，可以从这里迁移数据")
    print()

# 测试 MySQL 连接
print("测试 MySQL 连接...")
try:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        if result:
            print("✓ MySQL 连接成功！")
            print()
            
            # 获取数据库信息
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()[0]
            print(f"MySQL 版本: {version}")
            
            cursor.execute("SELECT DATABASE()")
            db_name = cursor.fetchone()[0]
            print(f"当前数据库: {db_name}")
            
            # 检查表
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            table_names = [t[0] for t in tables]
            
            print(f"表数量: {len(table_names)}")
            print()
            
            if table_names:
                print("表列表:")
                for table in table_names:
                    # 统计每个表的记录数
                    try:
                        cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
                        count = cursor.fetchone()[0]
                        print(f"  - {table}: {count} 条记录")
                    except Exception as e:
                        print(f"  - {table}: (无法统计 - {e})")
                print()
                
                # 检查用户表
                if 'core_user' in table_names or 'auth_user' in table_names:
                    user_table = 'core_user' if 'core_user' in table_names else 'auth_user'
                    cursor.execute(f"SELECT COUNT(*) FROM `{user_table}`")
                    user_count = cursor.fetchone()[0]
                    print(f"✓ 用户表存在，包含 {user_count} 个用户")
                else:
                    print("⚠️  未找到用户表")
            else:
                print("⚠️  数据库为空，没有表！")
                print()
                print("建议操作:")
                print("1. 如果 SQLite 有数据，运行迁移脚本:")
                print("   ./export_sqlite_to_mysql.sh")
                print("2. 或者运行 Django 迁移:")
                print("   python3 manage.py migrate")
            
            print()
            print("=" * 60)
            print("检查完成！")
            print("=" * 60)
            
except Exception as e:
    print(f"✗ MySQL 连接失败: {e}")
    print()
    print("可能的原因:")
    print("1. 数据库用户或密码错误")
    print("2. 数据库不存在")
    print("3. 用户没有权限")
    print("4. MySQL 服务未运行")
    print()
    print("解决方法:")
    print("1. 检查 .env 文件中的数据库配置")
    print("2. 在宝塔面板中确认数据库和用户已创建")
    print("3. 确认数据库用户密码正确")
    print("4. 检查 MySQL 服务状态: systemctl status mysql")
    sys.exit(1)








