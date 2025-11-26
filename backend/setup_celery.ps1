# Celery 和 Redis 设置脚本 (PowerShell)
# 使用方法: .\setup_celery.ps1

Write-Host "=== Celery 和 Redis 设置向导 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Redis Python 客户端
Write-Host "[1/4] 检查 Redis Python 客户端..." -ForegroundColor Yellow
try {
    python -c "import redis; print('✓ Redis 客户端已安装')" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Redis 客户端已安装" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Redis 客户端未安装，正在安装..." -ForegroundColor Yellow
        pip install redis
    }
} catch {
    Write-Host "  ✗ 检查失败" -ForegroundColor Red
}

# 2. 检查 Redis 服务器
Write-Host "`n[2/4] 检查 Redis 服务器..." -ForegroundColor Yellow
$redisRunning = $false
try {
    $result = python -c "import redis; r = redis.Redis(host='localhost', port=6379, db=0, socket_connect_timeout=1); r.ping(); print('OK')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $result -match "OK") {
        Write-Host "  ✓ Redis 服务器正在运行" -ForegroundColor Green
        $redisRunning = $true
    }
} catch {
    # Redis 未运行
}

if (-not $redisRunning) {
    Write-Host "  ✗ Redis 服务器未运行" -ForegroundColor Red
    Write-Host ""
    Write-Host "  请选择安装方式:" -ForegroundColor Yellow
    Write-Host "  1. 使用 WSL (推荐，如果已安装 WSL)" -ForegroundColor Cyan
    Write-Host "  2. 使用 Docker (需要先安装 Docker Desktop)" -ForegroundColor Cyan
    Write-Host "  3. 下载 Windows 版本" -ForegroundColor Cyan
    Write-Host "  4. 跳过，稍后手动安装" -ForegroundColor Cyan
    Write-Host ""
    $choice = Read-Host "请输入选项 (1-4)"
    
    switch ($choice) {
        "1" {
            Write-Host "`n使用 WSL 安装 Redis..." -ForegroundColor Yellow
            Write-Host "执行命令: wsl sudo apt-get update && wsl sudo apt-get install -y redis-server" -ForegroundColor Cyan
            Write-Host "然后启动: wsl sudo service redis-server start" -ForegroundColor Cyan
            Write-Host "`n或者运行: wsl redis-server --daemonize yes" -ForegroundColor Cyan
        }
        "2" {
            Write-Host "`n使用 Docker 启动 Redis..." -ForegroundColor Yellow
            if (Get-Command docker -ErrorAction SilentlyContinue) {
                docker run -d --name redis -p 6379:6379 redis:latest
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  ✓ Redis 容器启动成功" -ForegroundColor Green
                    $redisRunning = $true
                }
            } else {
                Write-Host "  ✗ Docker 未安装，请先安装 Docker Desktop" -ForegroundColor Red
                Write-Host "  下载地址: https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
            }
        }
        "3" {
            Write-Host "`n下载 Windows 版本的 Redis:" -ForegroundColor Yellow
            Write-Host "  https://github.com/microsoftarchive/redis/releases" -ForegroundColor Cyan
            Write-Host "  或使用 Memurai (Redis for Windows): https://www.memurai.com/" -ForegroundColor Cyan
        }
        "4" {
            Write-Host "`n跳过 Redis 安装" -ForegroundColor Yellow
            Write-Host "  稍后可以手动安装 Redis，然后运行: .\start_celery.ps1" -ForegroundColor Cyan
        }
        default {
            Write-Host "  无效选项" -ForegroundColor Red
        }
    }
}

# 3. 设置环境变量
Write-Host "`n[3/4] 配置环境变量..." -ForegroundColor Yellow
$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "  创建 .env 文件..." -ForegroundColor Yellow
    New-Item -ItemType File -Path $envFile | Out-Null
}

$envContent = Get-Content $envFile -ErrorAction SilentlyContinue
$celeryEnabled = $envContent | Select-String "CELERY_ENABLED"
if (-not $celeryEnabled) {
    Add-Content -Path $envFile -Value "`n# Celery 配置"
    Add-Content -Path $envFile -Value "CELERY_ENABLED=true"
    Write-Host "  ✓ 已添加 CELERY_ENABLED=true 到 .env 文件" -ForegroundColor Green
} else {
    Write-Host "  ✓ CELERY_ENABLED 已配置" -ForegroundColor Green
}

# 4. 测试 Celery
Write-Host "`n[4/4] 测试 Celery 配置..." -ForegroundColor Yellow
try {
    $testResult = python -c "from config.celery import app; print('✓ Celery 配置正常')" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Celery 配置正常" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Celery 配置有问题: $testResult" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ Celery 测试失败: $_" -ForegroundColor Red
}

# 总结
Write-Host "`n=== 设置完成 ===" -ForegroundColor Cyan
if ($redisRunning) {
    Write-Host "`n✓ Redis 正在运行" -ForegroundColor Green
    Write-Host "✓ Celery 已配置" -ForegroundColor Green
    Write-Host "`n现在可以启动 Celery Worker:" -ForegroundColor Yellow
    Write-Host "  .\start_celery.ps1" -ForegroundColor Cyan
    Write-Host "  或" -ForegroundColor Yellow
    Write-Host "  celery -A config worker --loglevel=info --pool=solo" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠ Redis 未运行" -ForegroundColor Yellow
    Write-Host "请先安装并启动 Redis，然后运行:" -ForegroundColor Yellow
    Write-Host "  .\start_celery.ps1" -ForegroundColor Cyan
    Write-Host "`n或者暂时使用同步模式（不启用 Celery）" -ForegroundColor Yellow
}

