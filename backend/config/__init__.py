from __future__ import annotations

# MySQL 兼容：如果使用 PyMySQL 替代 mysqlclient
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    # mysqlclient 已安装，无需 PyMySQL
    pass

# 确保 Django 启动时加载 Celery 应用（仅在启用 Celery 时生效）
try:
    from .celery import app as celery_app  # noqa: F401
except Exception:
    # 在未安装或未配置 Celery/Redis 的环境中静默跳过
    celery_app = None  # type: ignore


