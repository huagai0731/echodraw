# 检查 Celery Worker 状态
Write-Host "=== Celery Worker 状态检查 ===" -ForegroundColor Cyan
Write-Host ""

# 检查 Redis
Write-Host "[1] 检查 Redis..." -ForegroundColor Yellow
try {
    python -c "import redis; r = redis.Redis(host='localhost', port=6379, db=0); r.ping(); print('  ✓ Redis 正在运行')" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Redis 未运行" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ✗ Redis 连接失败" -ForegroundColor Red
    exit 1
}

# 检查任务注册
Write-Host "`n[2] 检查任务注册..." -ForegroundColor Yellow
try {
    $env:DJANGO_SETTINGS_MODULE = "config.settings"
    python -c "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); import django; django.setup(); from core.tasks import analyze_image_comprehensive_task; print('  ✓ 图像分析任务已注册:', analyze_image_comprehensive_task.name)" 2>&1
} catch {
    Write-Host "  ⚠ 无法直接测试任务注册（需要 Django 环境）" -ForegroundColor Yellow
    Write-Host "  任务会在 Celery Worker 启动时自动注册" -ForegroundColor Cyan
}

# 检查 Worker 进程
Write-Host "`n[3] 检查 Worker 进程..." -ForegroundColor Yellow
$celeryProcesses = Get-Process | Where-Object {$_.CommandLine -like "*celery*worker*" -or $_.ProcessName -eq "python"}
if ($celeryProcesses) {
    Write-Host "  找到 Python 进程，但无法确认是否为 Celery Worker" -ForegroundColor Yellow
    Write-Host "  建议: 在新终端窗口运行 'celery -A config worker --loglevel=info --pool=solo'" -ForegroundColor Cyan
} else {
    Write-Host "  ✗ 未找到 Celery Worker 进程" -ForegroundColor Red
    Write-Host "  请运行: celery -A config worker --loglevel=info --pool=solo" -ForegroundColor Cyan
}

Write-Host "`n=== 检查完成 ===" -ForegroundColor Cyan
Write-Host "`n如果 Worker 未运行，请在新终端窗口执行:" -ForegroundColor Yellow
Write-Host "  cd backend" -ForegroundColor Cyan
Write-Host "  celery -A config worker --loglevel=info --pool=solo" -ForegroundColor Cyan

