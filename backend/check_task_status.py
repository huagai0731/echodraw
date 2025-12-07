#!/usr/bin/env python
"""
检查并修复图像分析任务状态

使用方法：
    python check_task_status.py [task_id]
    如果不提供 task_id，会显示最近的任务状态
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


def check_task_status(task_id=None):
    """检查任务状态"""
    
    if task_id:
        # 检查指定任务
        try:
            task_obj = ImageAnalysisTask.objects.get(task_id=task_id)
            print(f"\n任务ID: {task_id}")
            print(f"数据库状态: {task_obj.status}")
            print(f"进度: {task_obj.progress}%")
            print(f"创建时间: {task_obj.created_at}")
            print(f"更新时间: {task_obj.updated_at}")
            print(f"完成时间: {task_obj.completed_at}")
            print(f"结果ID: {task_obj.result_data.get('result_id') if task_obj.result_data else None}")
            
            # 检查 Celery 任务状态
            celery_result = AsyncResult(task_id, app=app)
            print(f"Celery 状态: {celery_result.state}")
            print(f"Celery 是否成功: {celery_result.successful()}")
            print(f"Celery 是否失败: {celery_result.failed()}")
            
            # 如果 Celery 任务成功但数据库状态不是 success，修复它
            if celery_result.successful() and task_obj.status != ImageAnalysisTask.STATUS_SUCCESS:
                print(f"\n⚠️  发现不一致：Celery 任务已成功，但数据库状态为 {task_obj.status}")
                print("正在修复...")
                task_obj.status = ImageAnalysisTask.STATUS_SUCCESS
                task_obj.progress = 100
                if not task_obj.completed_at:
                    task_obj.completed_at = timezone.now()
                # 尝试从 Celery 结果获取数据
                try:
                    celery_data = celery_result.result
                    if celery_data and isinstance(celery_data, dict):
                        task_obj.result_data = celery_data
                        result_id = celery_data.get('result_id')
                        if result_id:
                            # 验证结果是否存在
                            try:
                                result = VisualAnalysisResult.objects.get(id=result_id)
                                print(f"✓ 验证结果存在: result_id={result_id}")
                            except VisualAnalysisResult.DoesNotExist:
                                print(f"⚠️  警告: 结果不存在 result_id={result_id}")
                except Exception as e:
                    print(f"⚠️  无法从 Celery 结果获取数据: {e}")
                task_obj.save()
                print("✓ 已修复任务状态")
            
            # 如果 Celery 任务失败但数据库状态不是 failure，修复它
            elif celery_result.failed() and task_obj.status != ImageAnalysisTask.STATUS_FAILURE:
                print(f"\n⚠️  发现不一致：Celery 任务已失败，但数据库状态为 {task_obj.status}")
                print("正在修复...")
                task_obj.status = ImageAnalysisTask.STATUS_FAILURE
                task_obj.error_message = str(celery_result.info) if celery_result.info else "任务失败"
                if not task_obj.completed_at:
                    task_obj.completed_at = timezone.now()
                task_obj.save()
                print("✓ 已修复任务状态")
            
        except ImageAnalysisTask.DoesNotExist:
            print(f"❌ 任务不存在: {task_id}")
    else:
        # 显示最近的任务
        print("\n最近的任务（最多10个）：")
        print("-" * 80)
        tasks = ImageAnalysisTask.objects.all().order_by('-created_at')[:10]
        
        for task in tasks:
            celery_result = AsyncResult(task.task_id, app=app)
            status_icon = "✓" if task.status == ImageAnalysisTask.STATUS_SUCCESS else "✗" if task.status == ImageAnalysisTask.STATUS_FAILURE else "⏳"
            print(f"{status_icon} {task.task_id[:36]}... | 状态: {task.status:8s} | 进度: {task.progress:3d}% | Celery: {celery_result.state:8s} | 创建: {task.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
            
            # 检查不一致
            if celery_result.successful() and task.status != ImageAnalysisTask.STATUS_SUCCESS:
                print(f"   ⚠️  不一致：Celery 成功但数据库状态为 {task.status}")
            elif celery_result.failed() and task.status != ImageAnalysisTask.STATUS_FAILURE:
                print(f"   ⚠️  不一致：Celery 失败但数据库状态为 {task.status}")


if __name__ == '__main__':
    task_id = sys.argv[1] if len(sys.argv) > 1 else None
    check_task_status(task_id)

