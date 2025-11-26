@echo off
REM Celery Worker 启动脚本 (Windows Batch)
REM 使用方法: 双击此文件或运行 START_CELERY.bat

echo ========================================
echo   启动 Celery Worker
echo ========================================
echo.

REM 检查 Redis
echo [1/2] 检查 Redis 连接...
python -c "import redis; r = redis.Redis(host='localhost', port=6379, db=0); r.ping(); print('✓ Redis 连接成功')" 2>nul
if errorlevel 1 (
    echo ✗ Redis 连接失败，请先启动 Redis
    pause
    exit /b 1
)

REM 启动 Celery Worker
echo.
echo [2/2] 启动 Celery Worker...
echo 按 Ctrl+C 停止 worker
echo.

python -m celery -A config worker --loglevel=info --pool=solo

pause

