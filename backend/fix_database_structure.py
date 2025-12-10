#!/usr/bin/env python
"""
数据库结构修复脚本
自动检测并修复数据库结构与模型不一致的问题。

使用方法:
    python fix_database_structure.py

功能:
    1. 检测缺失的字段
    2. 自动创建缺失的字段（如果可能）
    3. 报告无法自动修复的问题
"""

import os
import sys
import django
from django.core.management import call_command
from django.db import connection, transaction
from django.apps import apps

# 设置Django环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()


def get_db_columns(table_name):
    """获取数据库表中的所有列"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, 
                   CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = %s
        """, [table_name])
        return {row[0]: {
            'name': row[0],
            'type': row[1],
            'nullable': row[2] == 'YES',
            'default': row[3],
            'max_length': row[4],
            'precision': row[5],
            'scale': row[6],
        } for row in cursor.fetchall()}


def get_mysql_field_type(field):
    """将Django字段类型转换为MySQL字段类型"""
    from django.db import models
    
    if isinstance(field, models.AutoField):
        return "BIGINT AUTO_INCREMENT"
    elif isinstance(field, models.BigAutoField):
        return "BIGINT AUTO_INCREMENT"
    elif isinstance(field, models.IntegerField):
        if field.choices:
            return "INTEGER"
        return "INTEGER"
    elif isinstance(field, models.BigIntegerField):
        return "BIGINT"
    elif isinstance(field, models.SmallIntegerField):
        return "SMALLINT"
    elif isinstance(field, models.PositiveIntegerField):
        return "INTEGER UNSIGNED"
    elif isinstance(field, models.PositiveSmallIntegerField):
        return "SMALLINT UNSIGNED"
    elif isinstance(field, models.CharField):
        max_length = field.max_length or 255
        return f"VARCHAR({max_length})"
    elif isinstance(field, models.TextField):
        return "TEXT"
    elif isinstance(field, models.BooleanField):
        return "TINYINT(1)"
    elif isinstance(field, models.DateTimeField):
        return "DATETIME(6)"
    elif isinstance(field, models.DateField):
        return "DATE"
    elif isinstance(field, models.TimeField):
        return "TIME(6)"
    elif isinstance(field, models.DecimalField):
        return f"DECIMAL({field.max_digits},{field.decimal_places})"
    elif isinstance(field, models.FloatField):
        return "DOUBLE"
    elif isinstance(field, models.ImageField) or isinstance(field, models.FileField):
        return "VARCHAR(100)"
    elif isinstance(field, models.JSONField):
        return "JSON"
    elif isinstance(field, models.ForeignKey):
        return "BIGINT"
    elif isinstance(field, models.OneToOneField):
        return "BIGINT"
    elif isinstance(field, models.UUIDField):
        return "CHAR(36)"
    else:
        return "TEXT"  # 默认类型


def generate_add_column_sql(table_name, field, db_column):
    """生成添加列的SQL语句"""
    field_type = get_mysql_field_type(field)
    nullable = "NULL" if field.null or field.blank else "NOT NULL"
    
    default = ""
    if field.has_default():
        if callable(field.default):
            # 对于可调用默认值（如timezone.now），使用CURRENT_TIMESTAMP
            if 'datetime' in field_type.lower():
                default = "DEFAULT CURRENT_TIMESTAMP"
            else:
                default = ""
        else:
            default_value = field.default
            if isinstance(default_value, str):
                default = f"DEFAULT '{default_value}'"
            elif isinstance(default_value, (int, float)):
                default = f"DEFAULT {default_value}"
            elif isinstance(default_value, bool):
                default = f"DEFAULT {1 if default_value else 0}"
    
    sql = f"ALTER TABLE `{table_name}` ADD COLUMN `{db_column}` {field_type} {nullable}"
    if default:
        sql += f" {default}"
    
    return sql


def fix_missing_fields():
    """修复缺失的字段"""
    print("\n" + "=" * 60)
    print("检查并修复缺失字段...")
    print("=" * 60)
    
    issues = []
    fixes = []
    
    with connection.cursor() as cursor:
        # 获取所有已安装的模型
        for app_config in apps.get_app_configs():
            for model in app_config.get_models():
                table_name = model._meta.db_table
                
                # 检查表是否存在
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = DATABASE() 
                    AND table_name = %s
                """, [table_name])
                
                table_exists = cursor.fetchone()[0] > 0
                
                if not table_exists:
                    issues.append({
                        'type': 'missing_table',
                        'table': table_name,
                        'model': model.__name__,
                        'fixable': False,
                    })
                    continue
                
                # 获取数据库中的列
                db_columns = get_db_columns(table_name)
                
                # 检查模型字段
                for field in model._meta.get_fields():
                    if hasattr(field, 'column'):
                        field_name = field.column
                        
                        if field_name not in db_columns:
                            # 检查是否是关系字段（ForeignKey等）
                            if hasattr(field, 'related_model'):
                                # 关系字段通常有_id后缀
                                if field_name.endswith('_id'):
                                    # 检查基础字段是否存在
                                    base_name = field_name[:-3]
                                    if base_name in db_columns:
                                        continue
                            
                            # 生成修复SQL
                            try:
                                sql = generate_add_column_sql(table_name, field, field_name)
                                fixes.append({
                                    'table': table_name,
                                    'field': field_name,
                                    'model': model.__name__,
                                    'sql': sql,
                                })
                            except Exception as e:
                                issues.append({
                                    'type': 'missing_field',
                                    'table': table_name,
                                    'field': field_name,
                                    'model': model.__name__,
                                    'error': str(e),
                                    'fixable': False,
                                })
    
    # 报告问题
    if issues:
        print(f"\n发现 {len(issues)} 个无法自动修复的问题:")
        for issue in issues:
            print(f"  ✗ {issue['type']}: {issue.get('table', 'N/A')}.{issue.get('field', 'N/A')}")
            if 'error' in issue:
                print(f"    错误: {issue['error']}")
    
    # 应用修复
    if fixes:
        print(f"\n发现 {len(fixes)} 个可以修复的字段:")
        for fix in fixes:
            print(f"  + {fix['table']}.{fix['field']}")
        
        print("\n正在应用修复...")
        
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    for fix in fixes:
                        try:
                            print(f"  执行: {fix['sql']}")
                            cursor.execute(fix['sql'])
                            print(f"  ✓ 已添加字段 {fix['table']}.{fix['field']}")
                        except Exception as e:
                            print(f"  ✗ 添加字段 {fix['table']}.{fix['field']} 失败: {e}")
                            raise
            
            print("\n✓ 修复完成")
            return True
        except Exception as e:
            print(f"\n✗ 修复失败: {e}")
            import traceback
            traceback.print_exc()
            return False
    else:
        if not issues:
            print("\n✓ 未发现需要修复的字段")
        return len(issues) == 0


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("数据库结构修复脚本")
    print("=" * 60)
    
    # 首先尝试运行迁移
    print("\n步骤1: 检查并应用迁移...")
    try:
        call_command("migrate", verbosity=1, interactive=False)
        print("✓ 迁移检查完成")
    except Exception as e:
        print(f"✗ 迁移检查失败: {e}")
        print("继续尝试修复结构...")
    
    # 然后修复缺失字段
    print("\n步骤2: 修复缺失字段...")
    success = fix_missing_fields()
    
    # 最终报告
    print("\n" + "=" * 60)
    if success:
        print("✓ 数据库结构修复完成！")
        print("=" * 60)
        sys.exit(0)
    else:
        print("✗ 部分问题无法自动修复，请手动检查")
        print("=" * 60)
        print("\n建议:")
        print("1. 运行: python manage.py makemigrations")
        print("2. 运行: python manage.py migrate")
        print("3. 如果问题仍然存在，检查迁移文件是否正确")
        sys.exit(1)


if __name__ == "__main__":
    main()









