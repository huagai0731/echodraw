"""
Celery 配置
"""
import os
from celery import Celery

# 设置默认的 Django 设置模块
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('echo')

# 从环境变量读取配置，如果没有则使用默认值
app.config_from_object('django.conf:settings', namespace='CELERY')

# 自动发现任务（从所有已安装的 Django apps 中）
app.autodiscover_tasks()

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
