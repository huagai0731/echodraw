#!/usr/bin/env python
"""
安全修复数据库字段类型（只修复实际存在的字段）
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

print("=" * 60)
print("安全修复数据库字段类型")
print("=" * 60)
print()
print("⚠️  警告：此操作会修改数据库数据")
print("建议先备份数据库！")
print()
response = input("是否继续？(y/N): ")
if response.lower() != 'y':
    print("已取消")
    sys.exit(0)

print()
print("正在检查表结构并修复...")
print()

try:
    with connection.cursor() as cursor:
        # 需要检查和修复的表和字段
        tables_to_fix = {
            'core_encouragementmessage': [
                ('weight', 'UNSIGNED'),
            ],
            'core_conditionalmessage': [
                ('min_total_checkins', 'UNSIGNED'),
                ('max_total_checkins', 'UNSIGNED'),
                ('min_streak_days', 'UNSIGNED'),
                ('max_streak_days', 'UNSIGNED'),
                ('min_total_uploads', 'UNSIGNED'),
                ('max_total_uploads', 'UNSIGNED'),
            ],
            'core_uploadconditionalmessage': [
                ('min_total_hours', 'DECIMAL(10,2)'),
                ('max_total_hours', 'DECIMAL(10,2)'),
                ('min_avg_hours', 'DECIMAL(10,2)'),
                ('max_avg_hours', 'DECIMAL(10,2)'),
            ],
            'core_longtermgoal': [
                ('target_hours', 'DECIMAL(10,2)'),
                ('checkpoint_count', 'UNSIGNED'),
            ],
        }
        
        fixed_count = 0
        skipped_count = 0
        
        for table_name, fields in tables_to_fix.items():
            print(f"处理表: {table_name}")
            
            # 检查表是否存在
            cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
            if not cursor.fetchone():
                print(f"  ⚠️  表不存在，跳过")
                print()
                continue
            
            # 获取表结构
            cursor.execute(f"DESCRIBE {table_name}")
            columns = cursor.fetchall()
            existing_columns = {col[0]: col[1] for col in columns}
            
            for field_name, target_type in fields:
                if field_name not in existing_columns:
                    print(f"  - 字段 {field_name} 不存在，跳过")
                    skipped_count += 1
                    continue
                
                current_type = existing_columns[field_name].upper()
                
                # 检查是否需要修复（如果是字符串类型或 TEXT 类型）
                needs_fix = False
                if 'CHAR' in current_type or 'TEXT' in current_type or 'VARCHAR' in current_type:
                    needs_fix = True
                    print(f"  ✗ {field_name}: {current_type} -> 需要修复")
                else:
                    print(f"  ✓ {field_name}: {current_type} (已正确)")
                
                if needs_fix:
                    try:
                        # 修复数据：将字符串转换为数值
                        if 'UNSIGNED' in target_type or 'INT' in target_type:
                            # 整数类型
                            cursor.execute(f"""
                                UPDATE {table_name} 
                                SET {field_name} = CAST({field_name} AS UNSIGNED) 
                                WHERE {field_name} IS NOT NULL 
                                AND {field_name} != '' 
                                AND {field_name} REGEXP '^[0-9]+$'
                            """)
                        else:
                            # 浮点数类型
                            cursor.execute(f"""
                                UPDATE {table_name} 
                                SET {field_name} = CAST({field_name} AS DECIMAL(10,2)) 
                                WHERE {field_name} IS NOT NULL 
                                AND {field_name} != '' 
                                AND {field_name} REGEXP '^[0-9]+(\\.[0-9]+)?$'
                            """)
                        
                        affected = cursor.rowcount
                        if affected > 0:
                            print(f"    ✓ 修复了 {affected} 条记录")
                            fixed_count += 1
                        else:
                            print(f"    - 没有需要修复的记录")
                    except Exception as e:
                        print(f"    ✗ 修复失败: {e}")
            
            print()
        
        print("=" * 60)
        print(f"修复完成！")
        print(f"  修复字段数: {fixed_count}")
        print(f"  跳过字段数: {skipped_count}")
        print("=" * 60)
        print()
        print("建议重启 Gunicorn 使更改生效")
        
except Exception as e:
    print(f"✗ 修复失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)








