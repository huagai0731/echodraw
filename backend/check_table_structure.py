#!/usr/bin/env python
"""
检查数据库表结构，确保数值字段类型正确
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
print("检查数据库表结构")
print("=" * 60)
print()

# 需要检查的表和字段
tables_to_check = {
    'core_encouragementmessage': ['weight'],
    'core_conditionalmessage': [
        'min_total_checkins', 'max_total_checkins',
        'min_streak_days', 'max_streak_days',
        'min_total_uploads', 'max_total_uploads',
    ],
    'core_uploadconditionalmessage': [
        'min_total_uploads', 'max_total_uploads',
        'min_total_hours', 'max_total_hours',
        'min_avg_hours', 'max_avg_hours',
    ],
    'core_longtermgoal': ['target_hours', 'checkpoint_count'],
}

try:
    with connection.cursor() as cursor:
        all_ok = True
        
        for table_name, fields in tables_to_check.items():
            print(f"检查表: {table_name}")
            
            # 检查表是否存在
            cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
            if not cursor.fetchone():
                print(f"  ⚠️  表不存在，跳过")
                print()
                continue
            
            # 获取表结构
            cursor.execute(f"DESCRIBE {table_name}")
            columns = cursor.fetchall()
            column_dict = {col[0]: col[1] for col in columns}
            
            for field in fields:
                if field not in column_dict:
                    print(f"  ⚠️  字段 {field} 不存在")
                    all_ok = False
                    continue
                
                col_type = column_dict[field].upper()
                
                # 检查类型是否正确
                is_correct = False
                if 'INT' in col_type or 'UNSIGNED' in col_type:
                    # 整数类型
                    if 'weight' in field or 'checkins' in field or 'streak' in field or 'uploads' in field or 'count' in field:
                        is_correct = True
                elif 'DECIMAL' in col_type or 'FLOAT' in col_type or 'DOUBLE' in col_type:
                    # 浮点数类型
                    if 'hours' in field or 'target_hours' in field:
                        is_correct = True
                
                if is_correct:
                    print(f"  ✓ {field}: {col_type}")
                else:
                    print(f"  ✗ {field}: {col_type} (应该是数值类型)")
                    all_ok = False
            
            print()
        
        print("=" * 60)
        if all_ok:
            print("✓ 所有表结构正确！")
            print()
            print("新插入的数据不会有类型问题，因为：")
            print("1. Django ORM 会自动处理类型转换")
            print("2. 数据库字段类型定义正确")
            print("3. 代码中的类型转换只是针对旧数据的兼容处理")
        else:
            print("⚠️  发现表结构问题")
            print()
            print("建议：")
            print("1. 运行 Django 迁移确保表结构正确")
            print("   python3 manage.py migrate")
            print("2. 或者运行修复脚本")
            print("   ./fix_database_types.sh")
        print("=" * 60)
        
except Exception as e:
    print(f"✗ 检查失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)








