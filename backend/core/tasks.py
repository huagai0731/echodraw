"""
Celery 任务定义
"""
import logging
from typing import Dict, Any

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from core.models import ImageAnalysisTask
from core.image_analysis import analyze_image_simplified

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
def analyze_image_comprehensive_task(self, result_id: int, image_url: str, user_id: int, binary_threshold: int = 140):
    """
    异步执行图像分析任务（简化流程）
    
    Args:
        self: Celery任务实例（使用bind=True时自动传递）
        result_id: VisualAnalysisResult 记录ID
        image_url: 图片的TOS URL
        user_id: 用户ID
        binary_threshold: 二值化阈值，默认140
    
    Returns:
        结果ID
    """
    task_id = self.request.id
    task_obj = None
    
    try:
        from core.models import VisualAnalysisResult
        from core.image_analysis import analyze_image_simplified_from_url
        
        # 获取任务对象
        try:
            task_obj = ImageAnalysisTask.objects.get(task_id=task_id)
            task_obj.status = ImageAnalysisTask.STATUS_STARTED
            task_obj.progress = 10
            task_obj.save()
        except ImageAnalysisTask.DoesNotExist:
            logger.warning(f"任务对象不存在: {task_id}")
        
        # 执行分析
        logger.info(f"开始执行图像分析任务: {task_id}, 结果ID: {result_id}, 用户: {user_id}")
        
        # 定义进度回调函数
        def update_progress(progress_percent: int):
            """更新任务进度"""
            if task_obj:
                task_obj.progress = progress_percent
                task_obj.save(update_fields=['progress', 'updated_at'])
        
        # 执行分析（从TOS读取图片，处理，保存结果到TOS）
        analyze_image_simplified_from_url(
            image_url=image_url,
            result_id=result_id,
            binary_threshold=binary_threshold,
            progress_callback=update_progress
        )
        
        # 获取最终结果（只包含结构化数据）
        result_obj = VisualAnalysisResult.objects.get(id=result_id)
        result_data = {
            'result_id': result_id,
            'comprehensive_analysis': result_obj.comprehensive_analysis,
        }
        
        # 保存结果到任务对象
        if task_obj:
            try:
                from django.db import connection
                task_obj.status = ImageAnalysisTask.STATUS_SUCCESS
                task_obj.progress = 100
                task_obj.result_data = result_data
                task_obj.completed_at = timezone.now()
                task_obj.save(update_fields=['status', 'progress', 'result_data', 'completed_at', 'updated_at'])
                # 关闭数据库连接，确保事务立即提交，让其他进程（Django应用）能够立即看到更新
                connection.close()
                logger.info(f"任务状态已更新为成功: {task_id}, 结果ID: {result_id}")
            except Exception as save_error:
                logger.error(f"保存任务状态失败: {task_id}, 错误: {str(save_error)}")
                # 尝试重新获取任务对象并保存
                try:
                    from django.db import connection
                    task_obj = ImageAnalysisTask.objects.get(task_id=task_id)
                    task_obj.status = ImageAnalysisTask.STATUS_SUCCESS
                    task_obj.progress = 100
                    task_obj.result_data = result_data
                    task_obj.completed_at = timezone.now()
                    task_obj.save()
                    # 关闭数据库连接，确保事务立即提交
                    connection.close()
                    logger.info(f"重新保存任务状态成功: {task_id}")
                except Exception as retry_error:
                    logger.error(f"重新保存任务状态也失败: {task_id}, 错误: {str(retry_error)}")
        else:
            # 如果任务对象不存在，尝试创建或更新
            logger.warning(f"任务对象不存在，尝试创建: {task_id}")
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user = User.objects.get(id=user_id)
                task_obj, created = ImageAnalysisTask.objects.get_or_create(
                    task_id=task_id,
                    defaults={
                        'user': user,
                        'status': ImageAnalysisTask.STATUS_SUCCESS,
                        'progress': 100,
                        'result_data': result_data,
                        'completed_at': timezone.now(),
                    }
                )
                if not created:
                    # 如果已存在，更新它
                    task_obj.status = ImageAnalysisTask.STATUS_SUCCESS
                    task_obj.progress = 100
                    task_obj.result_data = result_data
                    task_obj.completed_at = timezone.now()
                    task_obj.save()
                logger.info(f"任务对象已{'创建' if created else '更新'}: {task_id}")
            except Exception as create_error:
                logger.error(f"创建/更新任务对象失败: {task_id}, 错误: {str(create_error)}")
        
        logger.info(f"图像分析任务完成: {task_id}, 结果ID: {result_id}")
        return result_data
        
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
