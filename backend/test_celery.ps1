# 测试 Celery 连接
Write-Host "测试 Celery 连接..." -ForegroundColor Yellow

# 测试 Redis 连接
Write-Host "`n[1] 测试 Redis 连接..." -ForegroundColor Cyan
python -c "import redis; r = redis.Redis(host='localhost', port=6379, db=0); r.ping(); print('✓ Redis 连接成功')"

# 测试 Celery 应用
Write-Host "`n[2] 测试 Celery 应用..." -ForegroundColor Cyan
python -c "from config.celery import app; print('✓ Celery 应用加载成功'); print('Broker:', app.conf.broker_url); print('Backend:', app.conf.result_backend)"

# 测试任务注册
Write-Host "`n[3] 测试任务注册..." -ForegroundColor Cyan
python -c "from config.celery import app; tasks = list(app.tasks.keys()); print('✓ 已注册任务:', len(tasks)); print('任务列表:'); [print(f'  - {t}') for t in tasks if not t.startswith('celery.')]"

Write-Host "`n✓ 所有测试完成" -ForegroundColor Green

