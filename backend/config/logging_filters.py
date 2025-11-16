"""
Logging filters for Django.
"""
import logging
import threading

# 使用线程本地存储来传递 trace_id
_thread_local = threading.local()


def set_trace_id(trace_id: str):
    """设置当前线程的 trace_id。"""
    _thread_local.trace_id = trace_id


def get_trace_id() -> str:
    """获取当前线程的 trace_id。"""
    return getattr(_thread_local, "trace_id", "unknown")


class RequireTraceIdFilter(logging.Filter):
    """
    日志过滤器，确保日志记录中包含 trace_id。
    
    从线程本地存储中获取 trace_id，如果无法获取则使用 "unknown"。
    """
    
    def filter(self, record):
        """
        为日志记录添加 trace_id。
        """
        record.trace_id = get_trace_id()
        return True

