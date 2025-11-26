"""
Django middleware for request tracing and logging.
"""
import uuid

from django.utils.deprecation import MiddlewareMixin

from config.logging_filters import set_trace_id, get_trace_id


class TraceIdMiddleware(MiddlewareMixin):
    """
    为每个请求生成唯一的 trace_id，用于追踪请求调用链。
    
    如果请求头中包含 X-Trace-Id，则使用该值；否则生成新的 UUID。
    生成的 trace_id 会被添加到 request 对象、响应头和日志中。
    """
    
    def process_request(self, request):
        """
        处理请求，生成或获取 trace_id。
        """
        # 从请求头获取 trace_id，如果没有则生成新的
        trace_id = request.META.get("HTTP_X_TRACE_ID", "").strip()
        if not trace_id:
            trace_id = str(uuid.uuid4())
        
        # 将 trace_id 存储到 request 对象中，供视图使用
        request.trace_id = trace_id
        
        # 设置到线程本地存储，供日志过滤器使用
        set_trace_id(trace_id)
        
        return None
    
    def process_response(self, request, response):
        """
        处理响应，将 trace_id 添加到响应头中。
        """
        if hasattr(request, "trace_id"):
            response["X-Trace-Id"] = request.trace_id
        return response

