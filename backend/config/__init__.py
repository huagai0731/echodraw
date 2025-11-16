from __future__ import annotations

# 确保 Django 启动时加载 Celery 应用（仅在启用 Celery 时生效）
try:
    from .celery import app as celery_app  # noqa: F401
except Exception:
    # 在未安装或未配置 Celery/Redis 的环境中静默跳过
    celery_app = None  # type: ignore


