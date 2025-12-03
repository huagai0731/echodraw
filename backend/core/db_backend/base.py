"""
自定义 MySQL 数据库后端，用于兼容 MySQL 5.7
注意：仅用于临时兼容，生产环境建议升级到 MySQL 8.0+
"""
from django.db.backends.mysql.base import DatabaseWrapper as MySQLDatabaseWrapper


class DatabaseWrapper(MySQLDatabaseWrapper):
    """禁用版本检查的 MySQL 后端"""
    
    def check_database_version_supported(self):
        """跳过数据库版本检查"""
        # 禁用版本检查，允许使用 MySQL 5.7
        pass








