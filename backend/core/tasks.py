"""
Celery 任务定义
"""
import logging
from typing import Dict, Any

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from core.models import ImageAnalysisTask
from core.image_analysis import analyze_image_comprehensive

logger = logging.getLogger(__name__)
User = get_user_model()


@shared_task(
    bind=True,
    name="core.tasks.analyze_image_comprehensive_task",
    max_retries=2,  # 最多重试2次
    default_retry_delay=60,  # 重试延迟60秒
    soft_time_limit=300,  # 软超时5分钟
    time_limit=360,  # 硬超时6分钟
)
def analyze_image_comprehensive_task(self, image_data: str, user_id: int):
    """
    异步执行图像专业分析任务
    
    Args:
        image_data: base64编码的图片数据
        user_id: 用户ID
    
    Returns:
        分析结果字典
    """
    task_id = self.request.id
    task_obj = None
    
    try:
        # 获取任务对象
        try:
            task_obj = ImageAnalysisTask.objects.get(task_id=task_id)
            task_obj.status = ImageAnalysisTask.STATUS_STARTED
            task_obj.progress = 10
            task_obj.save()
        except ImageAnalysisTask.DoesNotExist:
            logger.warning(f"任务对象不存在: {task_id}")
        
        # 执行分析
        logger.info(f"开始执行图像分析任务: {task_id}, 用户: {user_id}")
        
        # 更新进度
        if task_obj:
            task_obj.progress = 30
            task_obj.save()
        
        # 执行分析（这是最耗时的部分）
        results = analyze_image_comprehensive(image_data)
        
        # 更新进度
        if task_obj:
            task_obj.progress = 90
            task_obj.save()
        
        # 保存结果
        if task_obj:
            task_obj.status = ImageAnalysisTask.STATUS_SUCCESS
            task_obj.progress = 100
            task_obj.result_data = results
            task_obj.completed_at = timezone.now()
            task_obj.save()
        
        logger.info(f"图像分析任务完成: {task_id}")
        return results
        
    except Exception as e:
        logger.exception(f"图像分析任务失败: {task_id}, 错误: {str(e)}")
        
        # 更新任务状态为失败
        if task_obj:
            task_obj.status = ImageAnalysisTask.STATUS_FAILURE
            task_obj.error_message = str(e)
            task_obj.completed_at = timezone.now()
            task_obj.save()
        
        # 重新抛出异常，让 Celery 知道任务失败
        raise
