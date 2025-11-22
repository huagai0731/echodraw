#!/usr/bin/env python
"""
测试数据库连接脚本
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
print("数据库连接测试")
print("=" * 60)
print()

# 显示配置信息（隐藏密码）
db_config = settings.DATABASES['default']
print("数据库配置:")
print(f"  引擎: {db_config.get('ENGINE', 'N/A')}")
print(f"  主机: {db_config.get('HOST', 'N/A')}")
print(f"  端口: {db_config.get('PORT', 'N/A')}")
print(f"  数据库名: {db_config.get('NAME', 'N/A')}")
print(f"  用户名: {db_config.get('USER', 'N/A')}")
print(f"  密码: {'***' if db_config.get('PASSWORD') else '未设置'}")
print()

# 测试连接
print("测试连接...")
try:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        if result:
            print("✓ 数据库连接成功！")
            print()
            
            # 获取数据库版本
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()[0]
            print(f"MySQL 版本: {version}")
            
            # 获取数据库名
            cursor.execute("SELECT DATABASE()")
            db_name = cursor.fetchone()[0]
            print(f"当前数据库: {db_name}")
            
            # 统计表数量
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            print(f"表数量: {len(tables)}")
            
            if tables:
                print("\n表列表:")
                for table in tables[:10]:  # 只显示前10个
                    print(f"  - {table[0]}")
                if len(tables) > 10:
                    print(f"  ... 还有 {len(tables) - 10} 个表")
            
            print()
            print("=" * 60)
            print("连接测试完成！")
            print("=" * 60)
            
except Exception as e:
    print(f"✗ 数据库连接失败: {e}")
    print()
    print("请检查:")
    print("1. 数据库服务是否运行")
    print("2. .env 文件中的数据库配置是否正确")
    print("3. 数据库用户是否有权限")
    print("4. 防火墙设置")
    sys.exit(1)








