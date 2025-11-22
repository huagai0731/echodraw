#!/usr/bin/env python
"""
检查当前使用的数据库类型和位置
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

from django.conf import settings

print("=" * 60)
print("当前数据库配置检查")
print("=" * 60)
print()

db_config = settings.DATABASES['default']
engine = db_config.get('ENGINE', '')

print("数据库引擎:", engine)
print()

if 'sqlite' in engine.lower():
    db_path = db_config.get('NAME', '')
    print("数据库类型: SQLite")
    print(f"数据库文件: {db_path}")
    
    if isinstance(db_path, Path):
        db_path = str(db_path)
    
    if os.path.exists(db_path):
        size = os.path.getsize(db_path)
        print(f"文件大小: {size / 1024 / 1024:.2f} MB")
        print()
        print("✓ SQLite 数据库文件存在")
        print()
        print("要导出数据，请运行:")
        print(f"  ./export_sqlite_to_mysql.sh {db_path}")
    else:
        print("✗ SQLite 数据库文件不存在！")
        
elif 'mysql' in engine.lower() or 'mariadb' in engine.lower():
    print("数据库类型: MySQL/MariaDB")
    print(f"主机: {db_config.get('HOST', 'N/A')}")
    print(f"端口: {db_config.get('PORT', 'N/A')}")
    print(f"数据库名: {db_config.get('NAME', 'N/A')}")
    print(f"用户名: {db_config.get('USER', 'N/A')}")
    print()
    print("要导出 MySQL 数据，请使用:")
    print(f"  mysqldump -u {db_config.get('USER', 'root')} -p {db_config.get('NAME', 'echo')} > backup.sql")
    
elif 'postgresql' in engine.lower() or 'postgres' in engine.lower():
    print("数据库类型: PostgreSQL")
    print(f"主机: {db_config.get('HOST', 'N/A')}")
    print(f"端口: {db_config.get('PORT', 'N/A')}")
    print(f"数据库名: {db_config.get('NAME', 'N/A')}")
    print(f"用户名: {db_config.get('USER', 'N/A')}")
    print()
    print("要导出 PostgreSQL 数据，请使用:")
    print(f"  pg_dump -U {db_config.get('USER', 'postgres')} {db_config.get('NAME', 'echo')} > backup.sql")

print()
print("=" * 60)








