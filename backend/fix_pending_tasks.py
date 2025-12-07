#!/usr/bin/env python
"""
修复所有 Celery 成功但数据库状态为 pending/started 的任务

使用方法：
    python fix_pending_tasks.py
"""

import os
import sys
import django

# 设置 Django 环境
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.utils import timezone
from core.models import ImageAnalysisTask, VisualAnalysisResult
from celery.result import AsyncResult
from config.celery import app


def fix_pending_tasks():
    """修复所有不一致的任务状态"""
    
    print("正在查找需要修复的任务...")
    print("-" * 80)
    
    # 查找所有 pending 或 started 状态的任务
    pending_tasks = ImageAnalysisTask.objects.filter(
        status__in=[ImageAnalysisTask.STATUS_PENDING, ImageAnalysisTask.STATUS_STARTED]
    ).order_by('-created_at')
    
    fixed_count = 0
    error_count = 0
    
    for task in pending_tasks:
        celery_result = AsyncResult(task.task_id, app=app)
        
        # 检查 Celery 任务状态
        if celery_result.successful():
            # Celery 任务成功，但数据库状态不是 success
            print(f"\n修复任务: {task.task_id[:36]}...")
            print(f"  当前状态: {task.status}")
            print(f"  Celery 状态: SUCCESS")
            
            try:
                # 获取 Celery 结果
                celery_data = celery_result.result
                result_id = None
                
                if celery_data and isinstance(celery_data, dict):
                    result_id = celery_data.get('result_id')
                    task.result_data = celery_data
                
                # 如果没有从 Celery 结果获取到 result_id，尝试从任务对象获取
                if not result_id and task.result_data:
                    result_id = task.result_data.get('result_id')
                
                # 验证结果是否存在
                if result_id:
                    try:
                        result = VisualAnalysisResult.objects.get(id=result_id)
                        print(f"  ✓ 验证结果存在: result_id={result_id}")
                    except VisualAnalysisResult.DoesNotExist:
                        print(f"  ⚠️  警告: 结果不存在 result_id={result_id}")
                
                # 更新任务状态
                task.status = ImageAnalysisTask.STATUS_SUCCESS
                task.progress = 100
                if not task.completed_at:
                    task.completed_at = timezone.now()
                task.save()
                
                print(f"  ✓ 已修复为 success")
                fixed_count += 1
                
            except Exception as e:
                print(f"  ✗ 修复失败: {e}")
                error_count += 1
                
        elif celery_result.failed():
            # Celery 任务失败，但数据库状态不是 failure
            print(f"\n修复任务: {task.task_id[:36]}...")
            print(f"  当前状态: {task.status}")
            print(f"  Celery 状态: FAILURE")
            
            try:
                task.status = ImageAnalysisTask.STATUS_FAILURE
                task.error_message = str(celery_result.info) if celery_result.info else "任务失败"
                if not task.completed_at:
                    task.completed_at = timezone.now()
                task.save()
                
                print(f"  ✓ 已修复为 failure")
                fixed_count += 1
                
            except Exception as e:
                print(f"  ✗ 修复失败: {e}")
                error_count += 1
    
    print("\n" + "=" * 80)
    print(f"修复完成: 成功修复 {fixed_count} 个任务，失败 {error_count} 个任务")
    
    if fixed_count > 0:
        print("\n建议：刷新前端页面，应该能看到修复后的结果了")


if __name__ == '__main__':
    fix_pending_tasks()

