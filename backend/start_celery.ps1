# Celery Worker 启动脚本 (PowerShell)
# 使用方法: .\start_celery.ps1

Write-Host "正在启动 Celery Worker..." -ForegroundColor Green

# 检查 Redis 连接
Write-Host "`n检查 Redis 连接..." -ForegroundColor Yellow
try {
    $redisTest = python -c "import redis; r = redis.Redis(host='localhost', port=6379, db=0); r.ping(); print('Redis 连接成功')" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Redis 连接正常" -ForegroundColor Green
    } else {
        Write-Host "✗ Redis 连接失败，请先启动 Redis" -ForegroundColor Red
        Write-Host "`n安装 Redis 的方法:" -ForegroundColor Yellow
        Write-Host "1. 使用 WSL: wsl sudo apt-get install redis-server && wsl sudo service redis-server start" -ForegroundColor Cyan
        Write-Host "2. 使用 Docker: docker run -d -p 6379:6379 redis:latest" -ForegroundColor Cyan
        Write-Host "3. 下载 Windows 版本: https://github.com/microsoftarchive/redis/releases" -ForegroundColor Cyan
        exit 1
    }
} catch {
    Write-Host "✗ Redis 连接失败: $_" -ForegroundColor Red
    exit 1
}

# 检查环境变量
Write-Host "`n检查 Celery 配置..." -ForegroundColor Yellow
$celeryEnabled = $env:CELERY_ENABLED
if (-not $celeryEnabled) {
    Write-Host "提示: 未设置 CELERY_ENABLED 环境变量，将使用默认值 (false)" -ForegroundColor Yellow
    Write-Host "要启用 Celery，请设置: `$env:CELERY_ENABLED='true'" -ForegroundColor Cyan
}

# 启动 Celery Worker
Write-Host "`n启动 Celery Worker..." -ForegroundColor Green
Write-Host "按 Ctrl+C 停止 worker`n" -ForegroundColor Yellow

# 使用 python -m celery 确保能找到命令
python -m celery -A config worker --loglevel=info --pool=solo

