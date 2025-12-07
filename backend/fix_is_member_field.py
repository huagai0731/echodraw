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


def fix_is_member_field():
    """在 core_userprofile 表中添加 is_member 字段"""
    
    with connection.cursor() as cursor:
        # 检查字段是否已存在
        cursor.execute("""
            SELECT COUNT(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'core_userprofile'
            AND COLUMN_NAME = 'is_member'
        """)
        
        exists = cursor.fetchone()[0] > 0
        
        if exists:
            print("✓ is_member 字段已存在，无需添加")
            return
        
        # 添加字段
        try:
            cursor.execute("""
                ALTER TABLE `core_userprofile`
                ADD COLUMN `is_member` BOOLEAN NOT NULL DEFAULT 0
            """)
            print("✓ 成功添加 is_member 字段")
        except Exception as e:
            print(f"✗ 添加字段时出错: {e}")
            raise


def check_other_missing_fields():
    """检查其他可能缺失的字段"""
    
    expected_fields = {
        'membership_expires': 'DATETIME NULL',
        'membership_started_at': 'DATETIME NULL',
        'featured_artwork_ids': 'JSON NOT NULL',
    }
    
    with connection.cursor() as cursor:
        for field_name, field_type in expected_fields.items():
            cursor.execute("""
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'core_userprofile'
                AND COLUMN_NAME = %s
            """, [field_name])
            
            exists = cursor.fetchone()[0] > 0
            
            if not exists:
                print(f"⚠ 警告: {field_name} 字段缺失")
            else:
                print(f"✓ {field_name} 字段存在")


if __name__ == '__main__':
    print("开始修复数据库表结构...")
    print("-" * 50)
    
    try:
        fix_is_member_field()
        print("-" * 50)
        check_other_missing_fields()
        print("-" * 50)
        print("✓ 修复完成！")
    except Exception as e:
        print(f"✗ 修复失败: {e}")
        sys.exit(1)

