# 生产环境部署检查清单

本文档列出了在生产环境部署前必须完成的检查和配置。

## 🔒 安全配置

### 1. 环境变量配置

必须设置以下环境变量：

```bash
# 必需配置
DJANGO_SECRET_KEY=<随机生成的密钥，至少50字符>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DJANGO_CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 数据库配置（如果使用PostgreSQL/MySQL）
DJANGO_DB_ENGINE=django.db.backends.postgresql  # 或 mysql
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=your_db_host
DB_PORT=5432  # PostgreSQL默认端口，MySQL为3306

# SMTP配置
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USERNAME=your_email@example.com
SMTP_PASSWORD=your_email_password
SMTP_FROM_EMAIL=your_email@example.com

# 可选：开发环境标识（仅在开发环境使用）
DJANGO_ENVIRONMENT=development  # 仅在开发环境设置
```

### 2. 生成SECRET_KEY

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

将生成的密钥设置为 `DJANGO_SECRET_KEY` 环境变量。

### 3. 数据库选择

⚠️ **重要**: SQLite不适合生产环境，特别是日使用人数超过一万人的场景。

**推荐使用**:
- PostgreSQL（推荐）
- MySQL/MariaDB

**迁移步骤**:
1. 在 `settings.py` 中配置数据库连接
2. 运行 `python manage.py migrate` 创建表结构
3. 从SQLite导出数据并导入到新数据库

### 4. HTTPS配置

如果使用HTTPS，在 `settings.py` 中取消以下注释：

```python
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
```

## ✅ 使用检查脚本

运行生产环境配置检查脚本：

```bash
cd backend
python check_production_config.py
```

脚本会检查所有必需的配置项，确保配置正确。

## 📋 部署前检查项

- [ ] SECRET_KEY已设置且不是默认值
- [ ] DEBUG模式已禁用
- [ ] ALLOWED_HOSTS已正确配置
- [ ] CORS已正确配置，不允许所有源
- [ ] 数据库已从SQLite迁移到PostgreSQL/MySQL
- [ ] SMTP配置已设置
- [ ] 文件上传大小限制已配置（10MB）
- [ ] API限流已启用
- [ ] 安全HTTP头已配置
- [ ] HTTPS已配置（如果使用）

## 🚀 性能优化建议

### 1. 数据库连接池

对于高并发场景，建议配置数据库连接池：

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'OPTIONS': {
            'connect_timeout': 10,
        },
        'CONN_MAX_AGE': 600,  # 连接池保持时间（秒）
    }
}
```

### 2. 缓存配置

建议使用Redis作为缓存后端：

```python
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
    }
}
```

### 3. 静态文件服务

生产环境应使用Nginx或CDN服务静态文件，不要使用Django的静态文件服务。

### 4. 使用Gunicorn

使用Gunicorn作为WSGI服务器：

```bash
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4 --threads 2
```

根据服务器配置调整worker数量（建议：CPU核心数 * 2 + 1）。

## 🔍 监控和日志

### 1. 日志配置

确保日志已正确配置，记录错误和警告。

### 2. 监控

建议配置：
- 服务器资源监控（CPU、内存、磁盘）
- 数据库性能监控
- 应用错误监控（如Sentry）

## 📝 常见问题

### Q: 如何检查当前配置？

A: 运行 `python check_production_config.py` 脚本。

### Q: 忘记设置SECRET_KEY会怎样？

A: 应用会启动失败并提示错误信息。

### Q: 可以使用SQLite吗？

A: 不推荐。SQLite在高并发场景下性能较差，且不支持多进程访问。

### Q: CORS配置错误会怎样？

A: 前端可能无法访问API，浏览器会报CORS错误。

## 📞 支持

如有问题，请查看：
- Django部署文档: https://docs.djangoproject.com/en/stable/howto/deployment/
- 项目README文件

