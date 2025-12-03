# Celery 异步任务配置说明

## 概述

图像专业分析功能已改为使用 Celery 异步任务处理，这样可以：
- 不阻塞 Django 请求线程
- 支持多个任务并行处理
- 更好的错误处理和重试机制
- 可横向扩展 worker 数量

## 环境要求

1. **Redis** - 作为消息代理和结果后端
   - 默认配置：`redis://localhost:6379/0`
   - 可通过环境变量 `CELERY_BROKER_URL` 和 `CELERY_RESULT_BACKEND` 配置

2. **Python 依赖**
   - `celery[redis]>=5.4,<5.5`
   - `redis>=5.0.0,<5.1.0`

## 配置步骤

### 1. 安装 Redis

**Windows:**
- 下载 Redis for Windows: https://github.com/microsoftarchive/redis/releases
- 或使用 WSL: `sudo apt-get install redis-server`

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

### 2. 配置环境变量

在 `.env` 文件中添加：

```env
# 启用 Celery
CELERY_ENABLED=true

# Redis 配置（如果不在本地或使用不同端口）
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### 3. 启动 Celery Worker

在 `backend` 目录下运行：

```bash
# 开发环境
celery -A config worker --loglevel=info

# 生产环境（推荐使用多个 worker）
celery -A config worker --loglevel=info --concurrency=4
```

### 4. 启动 Celery Beat（可选，用于定时任务）

如果需要定时任务功能：

```bash
celery -A config beat --loglevel=info
```

## 使用方式

### 前端

前端会自动检测是否使用异步模式：
- 如果 `CELERY_ENABLED=true`，会创建异步任务并轮询状态
- 如果 `CELERY_ENABLED=false`，会使用同步处理（向后兼容）

### API

1. **创建分析任务**
   ```
   POST /api/visual-analysis/comprehensive/
   {
     "image_data": "base64_encoded_image"
   }
   ```
   返回：
   ```json
   {
     "task_id": "xxx-xxx-xxx",
     "status": "pending",
     "progress": 0,
     "message": "任务已创建，正在处理中"
   }
   ```

2. **查询任务状态**
   ```
   GET /api/visual-analysis/task/{task_id}/status/
   ```
   返回：
   ```json
   {
     "task_id": "xxx-xxx-xxx",
     "status": "started",
     "progress": 30,
     "created_at": "2025-11-26T...",
     "updated_at": "2025-11-26T...",
     "result": {...}  // 仅在 status="success" 时返回
   }
   ```

## 任务状态

- `pending` - 等待处理
- `started` - 正在处理
- `success` - 成功完成
- `failure` - 处理失败
- `retry` - 重试中
- `revoked` - 已取消

## 监控和管理

### 使用 Flower（可选）

Flower 是 Celery 的 Web 监控工具：

```bash
# 安装
pip install flower

# 启动
celery -A config flower
```

访问 `http://localhost:5555` 查看任务状态。

### 查看任务日志

任务执行日志会输出到 Celery worker 的控制台，包括：
- 任务开始/完成时间
- 进度更新
- 错误信息

## 性能优化

1. **增加 Worker 数量**
   ```bash
   celery -A config worker --concurrency=4
   ```

2. **使用多进程**
   ```bash
   celery -A config worker --pool=prefork --concurrency=4
   ```

3. **限制任务超时**
   在 `settings.py` 中配置：
   ```python
   CELERY_TASK_TIME_LIMIT = 300  # 5分钟
   CELERY_TASK_SOFT_TIME_LIMIT = 240  # 4分钟软限制
   ```

## 故障排查

1. **任务一直处于 pending 状态**
   - 检查 Celery worker 是否运行
   - 检查 Redis 连接是否正常
   - 查看 worker 日志

2. **任务失败**
   - 查看 worker 日志获取详细错误信息
   - 检查图片数据格式是否正确
   - 检查服务器资源（内存、CPU）

3. **Redis 连接失败**
   - 确认 Redis 服务正在运行：`redis-cli ping`
   - 检查 `CELERY_BROKER_URL` 配置
   - 检查防火墙设置

## 向后兼容

如果 `CELERY_ENABLED=false`，系统会自动回退到同步处理模式，保持向后兼容。

