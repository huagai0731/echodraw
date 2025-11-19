from __future__ import annotations

from celery import shared_task
from django.core.mail import send_mail


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def send_email_task(self, subject: str, message: str, from_email: str | None, recipient_list: list[str]) -> None:
    """
    生产级异步邮件任务：
    - 遇到瞬时失败会重试（最多2次，间隔5秒）
    - 与主请求线程解耦
    """
    try:
        send_mail(subject, message, from_email, recipient_list, fail_silently=False)
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc)






