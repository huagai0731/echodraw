"""
自定义异常处理器
确保所有异常都返回 JSON 格式的响应，而不是 HTML
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from django.http import Http404
from django.core.exceptions import PermissionDenied
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    自定义异常处理器
    确保所有异常都返回 JSON 格式
    """
    # 调用 DRF 的默认异常处理器
    response = exception_handler(exc, context)
    
    # 如果 DRF 已经处理了异常，直接返回
    if response is not None:
        return response
    
    # 处理 DRF 未处理的异常
    # 记录异常详情
    logger.exception(f"未处理的异常: {exc}")
    
    # 返回 JSON 格式的错误响应
    if isinstance(exc, Http404):
        return Response(
            {"detail": "资源未找到"},
            status=404
        )
    elif isinstance(exc, PermissionDenied):
        return Response(
            {"detail": "权限不足"},
            status=403
        )
    else:
        # 其他未处理的异常
        error_msg = str(exc) if exc else "服务器内部错误"
        return Response(
            {"detail": f"服务器错误: {error_msg}"},
            status=500
        )

