# 检查 Celery Worker 是否运行
Write-Host "=== 检查 Celery Worker ===" -ForegroundColor Cyan
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

# 检查任务队列
Write-Host "`n[2] 检查任务队列..." -ForegroundColor Yellow
try {
    $env:DJANGO_SETTINGS_MODULE = "config.settings"
    $result = python -c "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); import django; django.setup(); from config.celery import app; from celery import states; inspect = app.control.inspect(); active = inspect.active(); print('Active workers:', len(active) if active else 0); print('Tasks:', active)" 2>&1
    Write-Host $result
} catch {
    Write-Host "  ⚠ 无法检查 worker 状态（可能需要 worker 正在运行）" -ForegroundColor Yellow
}

# 检查最近的任务
Write-Host "`n[3] 检查最近的任务..." -ForegroundColor Yellow
try {
    $env:DJANGO_SETTINGS_MODULE = "config.settings"
    python -c "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); import django; django.setup(); from core.models import ImageAnalysisTask; from django.utils import timezone; from datetime import timedelta; recent = ImageAnalysisTask.objects.filter(created_at__gte=timezone.now() - timedelta(minutes=10)).order_by('-created_at')[:3]; print(f'最近10分钟的任务数: {len(recent)}'); [print(f'  - {t.task_id}: {t.status} (进度: {t.progress}%)') for t in recent]" 2>&1
} catch {
    Write-Host "  ⚠ 无法查询任务" -ForegroundColor Yellow
}

Write-Host "`n=== 诊断完成 ===" -ForegroundColor Cyan
Write-Host "`n如果 worker 未运行，请执行:" -ForegroundColor Yellow
Write-Host "  python -m celery -A config worker --loglevel=info --pool=solo" -ForegroundColor Cyan

