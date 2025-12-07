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
from django.contrib.auth import get_user_model


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


def check_table_exists(cursor, table_name):
    """检查表是否存在"""
    cursor.execute("""
        SELECT COUNT(*) 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = %s
    """, [table_name])
    return cursor.fetchone()[0] > 0


def create_visual_analysis_quota_table(cursor):
    """创建 core_visualanalysisquota 表"""
    table_name = 'core_visualanalysisquota'
    
    if check_table_exists(cursor, table_name):
        print(f"✓ {table_name} 表已存在")
        return False
    
    # 获取用户表名（通常是 auth_user）
    User = get_user_model()
    user_table = User._meta.db_table
    
    try:
        # 创建表
        cursor.execute(f"""
            CREATE TABLE `{table_name}` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `free_quota` INT UNSIGNED NOT NULL DEFAULT 10,
                `monthly_quota` INT UNSIGNED NOT NULL DEFAULT 0,
                `current_month` VARCHAR(7) NOT NULL DEFAULT '',
                `used_free_quota` INT UNSIGNED NOT NULL DEFAULT 0,
                `used_monthly_quota` INT UNSIGNED NOT NULL DEFAULT 0,
                `created_at` DATETIME(6) NOT NULL,
                `updated_at` DATETIME(6) NOT NULL,
                `user_id` BIGINT NOT NULL UNIQUE,
                FOREIGN KEY (`user_id`) REFERENCES `{user_table}` (`id`) ON DELETE CASCADE,
                INDEX `core_visual_user_id_07e9af_idx` (`user_id`),
                INDEX `core_visual_current_7c4742_idx` (`current_month`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        print(f"✓ 成功创建 {table_name} 表")
        return True
    except Exception as e:
        # 如果表已存在（并发情况），忽略错误
        if "already exists" in str(e).lower() or "1050" in str(e):
            print(f"✓ {table_name} 表已存在（并发创建）")
            return False
        print(f"✗ 创建 {table_name} 表时出错: {e}")
        raise


def fix_all_missing_fields():
    """在 core_userprofile 表中添加所有缺失的字段"""
    
    with connection.cursor() as cursor:
        print("检查并修复数据库结构...")
        print("-" * 50)
        
        # 1. 创建 VisualAnalysisQuota 表（如果不存在）
        print("1. 检查 VisualAnalysisQuota 表...")
        table_created = create_visual_analysis_quota_table(cursor)
        
        # 2. 添加 UserProfile 表的缺失字段
        print("\n2. 检查 UserProfile 表的字段...")
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
        if table_created or added_count > 0:
            print(f"✓ 修复完成：创建了 {1 if table_created else 0} 个表，添加了 {added_count} 个字段")
        else:
            print("✓ 所有表和字段都已存在，无需修复")
        
        return table_created or added_count > 0


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

