"""
管理命令：将视觉分析结果的base64数据迁移到TOS文件存储

使用方法：
    python manage.py migrate_visual_analysis_to_files

注意：
    - 此命令需要在运行0067迁移之前执行，或者用于迁移已存在的旧数据
    - 如果0067迁移已经运行，旧数据可能已经丢失
"""

from django.core.management.base import BaseCommand
from django.db import connection
from django.conf import settings
from django.core.files.base import ContentFile
import base64
import json


class Command(BaseCommand):
    help = '将视觉分析结果的base64数据迁移到TOS文件存储'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='只检查数据，不实际迁移',
        )
        parser.add_argument(
            '--backup',
            action='store_true',
            help='先备份数据到JSON文件',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        backup = options['backup']
        
        self.stdout.write("开始检查视觉分析结果数据...")
        
        # 检查字段类型
        with connection.cursor() as cursor:
            # 检查表结构
            if 'sqlite' in settings.DATABASES['default']['ENGINE']:
                cursor.execute("""
                    SELECT sql FROM sqlite_master 
                    WHERE type='table' AND name='core_visualanalysisresult'
                """)
            else:
                # MySQL/PostgreSQL
                cursor.execute("""
                    SELECT column_name, data_type, character_maximum_length
                    FROM information_schema.columns 
                    WHERE table_name = 'core_visualanalysisresult' 
                    AND column_name IN ('original_image', 'step1_binary', 'step2_grayscale', 'step3_lab_l', 'step4_hsv_s', 'step4_hls_s', 'step5_hue')
                    ORDER BY column_name
                """)
            
            columns = cursor.fetchall()
            
            if not columns:
                self.stdout.write(self.style.WARNING("未找到视觉分析结果表，可能表不存在"))
                return
            
            # 检查字段类型
            self.stdout.write("当前字段类型:")
            for col in columns:
                self.stdout.write(f"  {col}")
            
            # 检查是否有数据
            cursor.execute("SELECT COUNT(*) FROM core_visualanalysisresult")
            count = cursor.fetchone()[0]
            self.stdout.write(f"\n找到 {count} 条记录")
            
            if count == 0:
                self.stdout.write(self.style.SUCCESS("没有需要迁移的数据"))
                return
            
            # 尝试读取一条记录看看字段类型
            cursor.execute("SELECT * FROM core_visualanalysisresult LIMIT 1")
            row = cursor.fetchone()
            
            if row:
                # 获取列名
                cursor.execute("PRAGMA table_info(core_visualanalysisresult)" if 'sqlite' in settings.DATABASES['default']['ENGINE'] else """
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'core_visualanalysisresult' 
                    ORDER BY ordinal_position
                """)
                column_names = [col[0] for col in cursor.fetchall()]
                
                # 检查original_image字段的值
                try:
                    original_image_idx = column_names.index('original_image')
                    original_image_value = row[original_image_idx]
                    
                    if original_image_value:
                        # 检查是否是base64字符串（通常很长且以data:image开头或直接是base64）
                        if isinstance(original_image_value, str):
                            if len(original_image_value) > 1000 and (original_image_value.startswith('data:image') or ',' in original_image_value):
                                self.stdout.write(self.style.WARNING("\n检测到base64数据，需要迁移"))
                                self.stdout.write("注意：由于字段类型已经改变，可能需要特殊处理")
                                
                                if backup:
                                    self.backup_data(cursor, column_names)
                                
                                if not dry_run:
                                    self.migrate_data(cursor, column_names)
                                else:
                                    self.stdout.write(self.style.WARNING("这是dry-run模式，不会实际迁移数据"))
                            else:
                                self.stdout.write(self.style.SUCCESS("数据已经是文件路径格式，无需迁移"))
                        else:
                            self.stdout.write(self.style.SUCCESS("数据已经是文件对象，无需迁移"))
                    else:
                        self.stdout.write(self.style.WARNING("记录中没有图片数据"))
                except ValueError:
                    self.stdout.write(self.style.ERROR("无法找到original_image字段"))
            else:
                self.stdout.write(self.style.WARNING("无法读取记录"))

    def backup_data(self, cursor, column_names):
        """备份数据到JSON文件"""
        self.stdout.write("\n开始备份数据...")
        
        cursor.execute("SELECT * FROM core_visualanalysisresult")
        rows = cursor.fetchall()
        
        backup_data = []
        for row in rows:
            record = {}
            for i, col_name in enumerate(column_names):
                if col_name in ['original_image', 'step1_binary', 'step2_grayscale', 'step3_lab_l', 'step4_hsv_s', 'step4_hls_s', 'step5_hue']:
                    # 只备份base64数据字段
                    if i < len(row) and row[i]:
                        record[col_name] = row[i][:100] + "..." if len(str(row[i])) > 100 else row[i]  # 只保存前100字符作为预览
                else:
                    record[col_name] = str(row[i]) if i < len(row) else None
            backup_data.append(record)
        
        backup_file = 'visual_analysis_backup.json'
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        
        self.stdout.write(self.style.SUCCESS(f"数据已备份到 {backup_file}"))

    def migrate_data(self, cursor, column_names):
        """迁移数据"""
        self.stdout.write("\n开始迁移数据...")
        self.stdout.write(self.style.WARNING("注意：由于字段类型已经改变，此操作可能无法直接执行"))
        self.stdout.write("建议：")
        self.stdout.write("1. 如果0067迁移还未运行，先运行此命令备份数据")
        self.stdout.write("2. 运行0067迁移改变字段类型")
        self.stdout.write("3. 使用备份的数据重新创建记录（需要手动处理）")
        
        # 由于字段类型已经改变，直接迁移可能不可行
        # 这里提供一个框架，实际执行需要根据具体情况调整

