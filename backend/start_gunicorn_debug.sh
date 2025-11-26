#!/bin/bash
# Gunicorn 调试启动脚本（单进程，详细日志）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "启动 Gunicorn（调试模式）"
echo "=========================================="

# 激活虚拟环境
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# 设置环境变量
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings}"

# 先运行诊断
echo "运行环境诊断..."
python check_gunicorn.py

echo ""
echo "启动 Gunicorn（单进程模式，便于调试）..."
echo "按 Ctrl+C 停止"
echo ""

# 单进程启动，便于查看错误信息
exec gunicorn \
    --workers 1 \
    --worker-class sync \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --log-level debug \
    --access-logfile - \
    --error-logfile - \
    --pythonpath "$SCRIPT_DIR" \
    config.wsgi:application








