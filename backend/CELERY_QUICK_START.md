# Celery 快速启动指南

## ✅ 当前状态

- ✓ Redis 已安装并运行
- ✓ Celery 已配置
- ✓ 环境变量已设置 (`CELERY_ENABLED=true`)
- ✓ 数据库迁移已完成

## 🚀 启动步骤

### 1. 启动 Celery Worker

**在新终端窗口运行：**

```powershell
cd backend
python -m celery -A config worker --loglevel=info --pool=solo
```

**重要**: Windows 上必须使用 `--pool=solo`！

### 2. 启动 Django 服务器

**在另一个终端窗口运行：**

```powershell
cd backend
python manage.py runserver
```

### 3. 测试功能

1. 打开前端应用
2. 上传一张图片
3. 点击"专业分析"按钮
4. 系统会：
   - 立即返回任务ID（不阻塞）
   - 自动轮询任务状态
   - 显示进度条
   - 完成后显示分析结果

## 📋 验证 Worker 是否运行

运行检查脚本：
```powershell
.\check_celery_status.ps1
```

或手动检查：
```powershell
# 检查 Redis
python -c "import redis; r = redis.Redis(); r.ping(); print('Redis OK')"

# 检查 Celery 配置
python -c "from config.celery import app; print('Celery OK')"
```

## 🔧 常用命令

### 查看 Worker 日志
Worker 启动后会在终端显示实时日志，包括：
- 任务接收
- 任务执行进度
- 任务完成/失败

### 停止 Worker
在 Worker 终端窗口按 `Ctrl+C`

### 重启 Worker
1. 停止当前 Worker (`Ctrl+C`)
2. 重新运行启动命令

## ⚠️ 注意事项

1. **必须使用 `--pool=solo`**: Windows 不支持 `prefork` 或 `gevent`
2. **Redis 必须运行**: 如果 Redis 停止，Worker 将无法工作
3. **开发环境**: 当前配置适合开发，生产环境需要额外优化

## 🐛 故障排查

### Worker 无法启动
- 检查 Redis: `python -c "import redis; r = redis.Redis(); r.ping()"`
- 检查环境变量: 确认 `.env` 中有 `CELERY_ENABLED=true`
- 查看错误信息: Worker 启动时会显示详细错误

### 任务一直 pending
- 确认 Worker 正在运行（查看终端输出）
- 检查 Worker 日志是否有错误
- 验证任务是否正确注册

### 连接被拒绝
- 确认 Redis 在 `localhost:6379` 运行
- 检查防火墙设置
- 验证 `CELERY_BROKER_URL` 配置

## 📚 更多信息

- 详细配置: `CELERY_SETUP.md`
- 快速参考: `README_CELERY.md`

