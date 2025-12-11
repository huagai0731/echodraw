"""
检查所有Django模型表的id字段AUTO_INCREMENT状态
用于诊断MySQL数据库迁移问题
"""
from django.core.management.base import BaseCommand
from django.db import connection
from django.apps import apps


class Command(BaseCommand):
    help = '检查所有Django模型表的id字段AUTO_INCREMENT状态'

    def handle(self, *args, **options):
        # 检查是否是MySQL数据库
        vendor = connection.vendor
        if vendor not in ['mysql', 'mariadb']:
            self.stdout.write(
                self.style.WARNING(f'当前数据库是 {vendor}，此命令仅适用于MySQL/MariaDB')
            )
            return

        self.stdout.write(self.style.SUCCESS('开始检查所有表的AUTO_INCREMENT状态...\n'))

        # 获取所有Django模型
        all_models = apps.get_models()
        
        # 存储需要修复的表
        tables_to_fix = []
        
        with connection.cursor() as cursor:
            for model in all_models:
                # 获取表名（Django的db_table或默认表名）
                table_name = model._meta.db_table
                
                # 检查是否有id字段（主键）
                if not hasattr(model._meta, 'pk') or model._meta.pk.name != 'id':
                    continue
                
                # 检查id字段是否是BigAutoField或AutoField
                pk_field = model._meta.pk
                if not (hasattr(pk_field, 'get_internal_type') and 
                       pk_field.get_internal_type() in ['BigAutoField', 'AutoField']):
                    continue
                
                # 查询表结构
                try:
                    cursor.execute("""
                        SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE, COLUMN_KEY
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                        AND TABLE_NAME = %s
                        AND COLUMN_NAME = 'id'
                    """, [table_name])
                    
                    result = cursor.fetchone()
                    
                    if result:
                        column_type, extra, is_nullable, column_key = result
                        has_auto_increment = 'auto_increment' in extra.lower() if extra else False
                        
                        status = '✓' if has_auto_increment else '✗'
                        status_style = self.style.SUCCESS if has_auto_increment else self.style.ERROR
                        
                        self.stdout.write(
                            f"{status_style(status)} {table_name:40} "
                            f"类型: {column_type:20} "
                            f"EXTRA: {extra or 'N/A':20} "
                            f"主键: {column_key or 'N/A'}"
                        )
                        
                        if not has_auto_increment:
                            tables_to_fix.append(table_name)
                    else:
                        self.stdout.write(
                            self.style.WARNING(f"⚠  {table_name:40} 未找到id字段")
                        )
                        
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"✗  {table_name:40} 检查失败: {e}")
                    )
        
        # 输出总结
        self.stdout.write('\n' + '='*80)
        if tables_to_fix:
            self.stdout.write(
                self.style.ERROR(f'\n发现 {len(tables_to_fix)} 个表需要修复AUTO_INCREMENT:')
            )
            for table in tables_to_fix:
                self.stdout.write(self.style.ERROR(f'  - {table}'))
            self.stdout.write(
                self.style.WARNING(
                    '\n建议：创建迁移文件修复这些表，参考 0089_fix_userupload_shorttermgoal_auto_increment.py'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS('\n✓ 所有表的AUTO_INCREMENT状态正常！')
            )

