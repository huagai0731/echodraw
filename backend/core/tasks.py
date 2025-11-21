from __future__ import annotations

from celery import shared_task
from django.core.mail import send_mail
from django.core.management import call_command


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


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_monthly_reports_task(self):
    """
    每月1号自动生成上个月的固定月报。
    这个任务应该在每月1号的凌晨执行（通过Celery Beat调度）。
    """
    try:
        call_command("generate_monthly_report", verbosity=1)
    except Exception as exc:  # noqa: BLE001
        # 如果失败，重试（最多3次，间隔60秒）
        raise self.retry(exc=exc)









