#!/usr/bin/env python
"""
手动修复数据库表结构：添加缺失的 is_member 字段

使用方法：
    python fix_is_member_field.py
"""

import os
import sys
import django

# 设置 Django 环境
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection


def check_and_add_field(cursor, field_name, sql):
    """检查字段是否存在，如果不存在则添加"""
    cursor.execute("""
        SELECT COUNT(*) 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'core_userprofile'
        AND COLUMN_NAME = %s
    """, [field_name])
    
    exists = cursor.fetchone()[0] > 0
    
    if exists:
        print(f"✓ {field_name} 字段已存在")
        return False
    
    # 添加字段
    try:
        cursor.execute(sql)
        print(f"✓ 成功添加 {field_name} 字段")
        return True
    except Exception as e:
        # 如果字段已存在（并发情况），忽略错误
        if "Duplicate column name" in str(e) or "1060" in str(e):
            print(f"✓ {field_name} 字段已存在（并发添加）")
            return False
        print(f"✗ 添加 {field_name} 字段时出错: {e}")
        raise


def fix_all_missing_fields():
    """在 core_userprofile 表中添加所有缺失的字段"""
    
    with connection.cursor() as cursor:
        print("检查并添加缺失的字段...")
        print("-" * 50)
        
        # 需要添加的字段列表
        fields_to_add = [
            ('is_member', """
                ALTER TABLE `core_userprofile`
                ADD COLUMN `is_member` BOOLEAN NOT NULL DEFAULT 0
            """),
            ('membership_expires', """
                ALTER TABLE `core_userprofile`
                ADD COLUMN `membership_expires` DATETIME NULL
            """),
            ('membership_started_at', """
                ALTER TABLE `core_userprofile`
                ADD COLUMN `membership_started_at` DATETIME NULL
            """),
            ('featured_artwork_ids', """
                ALTER TABLE `core_userprofile`
                ADD COLUMN `featured_artwork_ids` JSON NOT NULL DEFAULT (JSON_ARRAY())
            """),
        ]
        
        added_count = 0
        for field_name, sql in fields_to_add:
            if check_and_add_field(cursor, field_name, sql):
                added_count += 1
        
        print("-" * 50)
        if added_count > 0:
            print(f"✓ 共添加了 {added_count} 个字段")
        else:
            print("✓ 所有字段都已存在，无需添加")
        
        return added_count


if __name__ == '__main__':
    print("开始修复数据库表结构...")
    print("-" * 50)
    
    try:
        fix_all_missing_fields()
        print("-" * 50)
        print("✓ 修复完成！")
    except Exception as e:
        print(f"✗ 修复失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

