# 图像分析性能优化文档

## 已实施的优化

### 1. 图片尺寸优化
- **默认尺寸**：从 1536px 降至 800px
- **性能提升**：减少约 73% 的计算量
- **配置方式**：通过环境变量 `IMAGE_ANALYSIS_MAX_SIDE` 调整

### 2. K-means 聚类优化
- **采样策略**：每 2-4 个像素取 1 个进行聚类
- **性能提升**：减少约 75% 的 K-means 计算量
- **质量影响**：几乎无影响（采样后对所有像素重新分配）

### 3. 去饱和可读性分析优化
- **算法改进**：使用 `uniform_filter` 替代 `generic_filter`
- **性能提升**：提升 5-10 倍速度
- **精度影响**：轻微降低（使用 7x7 核替代 5x5 核，但速度更快）

### 4. 内存管理优化
- **显式释放**：分析完成后立即释放大数组
- **GC 触发**：主动调用 `gc.collect()` 回收内存
- **并发优势**：减少内存峰值，支持更多并发任务

### 5. Celery 并发配置优化
- **并发控制**：默认 2 个 worker（可通过环境变量调整）
- **预取限制**：每个 worker 只预取 1 个任务，避免内存堆积
- **超时设置**：软超时 5 分钟，硬超时 6 分钟
- **重试机制**：最多重试 2 次，延迟 60 秒

## 性能预期

### 单任务处理时间
- **优化前**：约 2 分钟
- **优化后**：约 20-40 秒
- **提升**：约 3-6 倍

### 并发处理能力
- **4核CPU + 8GB内存**：建议 `concurrency=2`，可同时处理 2 个任务
- **8核CPU + 16GB内存**：建议 `concurrency=4`，可同时处理 4 个任务
- **16核CPU + 32GB内存**：建议 `concurrency=8`，可同时处理 8 个任务

### 内存使用
- **单任务峰值**：约 200-300MB（800px 图片）
- **并发 2 任务**：约 400-600MB
- **并发 4 任务**：约 800MB-1.2GB

## 环境变量配置

```bash
# 图片分析最大边长（像素）
IMAGE_ANALYSIS_MAX_SIDE=800

# Celery Worker 并发数
CELERY_WORKER_CONCURRENCY=2

# Celery 启用状态
CELERY_ENABLED=true

# Redis 连接（Celery Broker）
CELERY_BROKER_URL=redis://localhost:6379/0

# Redis 连接（Celery Result Backend）
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

## 启动 Celery Worker

### Windows（推荐使用 solo pool）
```powershell
python -m celery -A config worker --loglevel=info --pool=solo --concurrency=2
```

### Linux/Mac（推荐使用 prefork pool）
```bash
celery -A config worker --loglevel=info --concurrency=2
```

## 监控建议

### 1. 任务执行时间
- 监控平均执行时间，如果超过 60 秒，考虑进一步优化
- 监控失败率，如果超过 5%，检查资源是否充足

### 2. 内存使用
- 监控 Celery worker 内存使用，如果持续超过 80%，考虑降低并发数
- 监控 Redis 内存使用，确保有足够空间存储任务结果

### 3. 队列长度
- 监控待处理任务数量，如果持续增长，考虑增加 worker 数量
- 监控任务积压情况，及时扩容

## 进一步优化建议

### 1. 结果缓存（未来优化）
- 对相同图片（MD5 哈希）缓存分析结果
- 减少重复计算，提升响应速度

### 2. 分布式处理（未来优化）
- 使用多个 Celery worker 节点
- 通过 Redis 队列分发任务
- 支持水平扩展

### 3. 图片预处理（未来优化）
- 在客户端进行初步压缩
- 减少网络传输和服务器处理时间

### 4. 异步结果存储（未来优化）
- 将分析结果存储到对象存储（如 TOS）
- 减少数据库压力
- 支持大文件存储

## 故障排查

### 任务执行超时
1. 检查图片尺寸是否过大
2. 检查服务器 CPU 和内存使用情况
3. 考虑降低并发数或增加超时时间

### 内存不足
1. 降低 `CELERY_WORKER_CONCURRENCY`
2. 降低 `IMAGE_ANALYSIS_MAX_SIDE`
3. 增加服务器内存

### 任务积压
1. 增加 Celery worker 数量
2. 增加并发数（如果资源充足）
3. 检查 Redis 连接是否正常

