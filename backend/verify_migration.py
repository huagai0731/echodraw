#!/usr/bin/env python
"""
验证数据库迁移是否成功
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

print("=" * 60)
print("验证数据库迁移")
print("=" * 60)
print()

# 测试连接
try:
    with connection.cursor() as cursor:
        # 检查表
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        table_names = [t[0] for t in tables]
        
        print(f"✓ 数据库连接成功")
        print(f"✓ 找到 {len(table_names)} 个表")
        print()
        
        # 检查关键表
        key_tables = {
            'core_user': '用户表',
            'django_migrations': 'Django 迁移表',
            'core_userupload': '用户上传表',
        }
        
        print("关键表检查:")
        for table, desc in key_tables.items():
            if table in table_names:
                cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
                count = cursor.fetchone()[0]
                print(f"  ✓ {table} ({desc}): {count} 条记录")
            else:
                print(f"  ✗ {table} ({desc}): 不存在")
        print()
        
        # 检查用户数据
        if 'core_user' in table_names:
            cursor.execute("SELECT COUNT(*) FROM core_user")
            user_count = cursor.fetchone()[0]
            print(f"用户数据: {user_count} 个用户")
            
            if user_count > 0:
                cursor.execute("SELECT email, username FROM core_user LIMIT 5")
                users = cursor.fetchall()
                print("示例用户:")
                for email, username in users:
                    print(f"  - {email} ({username})")
            else:
                print("⚠️  用户表为空")
        
        print()
        print("=" * 60)
        if len(table_names) > 0:
            print("✓ 迁移验证成功！")
            print("=" * 60)
            print()
            print("下一步:")
            print("1. 重启 Gunicorn: ./start_gunicorn.sh")
            print("2. 访问网站测试登录功能")
        else:
            print("⚠️  数据库为空，可能需要重新导入")
            print("=" * 60)
            
except Exception as e:
    print(f"✗ 验证失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)








