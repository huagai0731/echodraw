# Celery 快速启动指南

## ✅ 当前状态

Celery 已配置完成！Redis 正在运行，环境变量已设置。

## 🚀 启动 Celery Worker

### 方法 1: 使用启动脚本（推荐）
```powershell
.\start_celery.ps1
```

### 方法 2: 直接命令
```powershell
python -m celery -A config worker --loglevel=info --pool=solo
```

**注意**: Windows 上必须使用 `--pool=solo`，因为 Windows 不支持 `prefork` 或 `gevent` 池。

## 📋 常用命令

### 查看 Worker 状态
```powershell
python -m celery -A config inspect active
```

### 查看注册的任务
```powershell
python -m celery -A config inspect registered
```

### 停止 Worker
按 `Ctrl+C` 或关闭终端窗口

## 🔍 验证设置

运行测试脚本：
```powershell
.\test_celery.ps1
```

## 📝 环境变量

已在 `.env` 文件中设置：
```
CELERY_ENABLED=true
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

## 🎯 使用方式

1. **启动 Django 服务器**（另一个终端）
   ```powershell
   python manage.py runserver
   ```

2. **启动 Celery Worker**（当前终端）
   ```powershell
   celery -A config worker --loglevel=info --pool=solo
   ```

3. **测试专业分析功能**
   - 在前端上传图片
   - 点击"专业分析"按钮
   - 系统会自动创建异步任务并轮询状态

## ⚠️ 注意事项

- **Windows 限制**: 必须使用 `--pool=solo`，不支持多进程
- **Redis 必须运行**: 如果 Redis 停止，Celery 将无法工作
- **开发环境**: 当前配置适合开发环境，生产环境需要额外配置

## 🐛 故障排查

### Worker 无法启动
1. 检查 Redis 是否运行: `python -c "import redis; r = redis.Redis(); r.ping()"`
2. 检查环境变量: 确认 `.env` 文件中有 `CELERY_ENABLED=true`
3. 查看错误日志: Celery 会输出详细的错误信息

### 任务一直处于 pending 状态
1. 确认 Worker 正在运行
2. 检查 Worker 日志是否有错误
3. 验证任务是否正确注册

### Redis 连接失败
1. 确认 Redis 服务正在运行
2. 检查端口 6379 是否被占用
3. 验证 `CELERY_BROKER_URL` 配置

## 📚 更多信息

详细配置说明请查看: `CELERY_SETUP.md`

