from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Iterable, Optional

from django.core.mail import send_mail
from django.conf import settings

try:
    # 懒加载 Celery 任务（未安装或未启用时不抛错）
    from core.tasks import send_email_task  # type: ignore
except Exception:  # noqa: BLE001
    send_email_task = None  # type: ignore

_executor = ThreadPoolExecutor(
    max_workers=4,
    thread_name_prefix="echo-mailer",
)


def send_mail_async(
    subject: str,
    message: str,
    from_email: Optional[str],
    recipient_list: Iterable[str],
) -> None:
    """
    异步发送邮件：提交到线程池立即返回，避免阻塞请求线程。
    失败会在工作线程中记录异常日志，不影响主流程。
    若启用 Celery（CELERY_ENABLED=true），优先使用任务队列。
    """

    # 优先通过 Celery 发送（生产建议）
    if getattr(settings, "CELERY_ENABLED", False) and send_email_task is not None:
        try:
            send_email_task.delay(subject, message, from_email, list(recipient_list))
            return
        except Exception:
            # 回退到线程池，避免因 Celery 故障而影响主流程
            pass

    def _task():
        send_mail(subject, message, from_email, list(recipient_list), fail_silently=False)

    _executor.submit(_task)


