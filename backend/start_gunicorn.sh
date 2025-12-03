#!/bin/bash
# Gunicorn 启动脚本（带错误诊断）

set -e  # 遇到错误立即退出

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "启动 Gunicorn 服务器"
echo "=========================================="

# 1. 检查虚拟环境
if [ -d ".venv" ]; then
    echo "激活虚拟环境..."
    source .venv/bin/activate
elif [ -d "venv" ]; then
    echo "激活虚拟环境..."
    source venv/bin/activate
else
    echo "警告: 未找到虚拟环境，使用系统 Python"
fi

# 2. 运行诊断脚本
echo ""
echo "运行环境诊断..."
python check_gunicorn.py || {
    echo "错误: 环境诊断失败，请修复问题后重试"
    exit 1
}

# 3. 设置环境变量（如果未设置）
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings}"

# 4. 检查必要的环境变量
if [ -z "$DJANGO_SECRET_KEY" ]; then
    echo ""
    echo "警告: DJANGO_SECRET_KEY 未设置"
    echo "如果这是生产环境，请设置环境变量："
    echo "  export DJANGO_SECRET_KEY='your-secret-key'"
    echo ""
    read -p "是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 5. 设置 Gunicorn 参数
# Workers 配置建议：
# - 4核8GB服务器：2-3个workers（默认2）
# - 8核16GB服务器：4-6个workers
# - 16核32GB服务器：8-12个workers
# 公式：(CPU核心数 * 2) + 1，但需考虑内存限制
WORKERS="${GUNICORN_WORKERS:-2}"
WORKER_CLASS="${GUNICORN_WORKER_CLASS:-sync}"
BIND="${GUNICORN_BIND:-0.0.0.0:8000}"
TIMEOUT="${GUNICORN_TIMEOUT:-120}"
ACCESS_LOG="${GUNICORN_ACCESS_LOG:--}"
ERROR_LOG="${GUNICORN_ERROR_LOG:--}"

echo ""
echo "Gunicorn 配置:"
echo "  工作进程数: $WORKERS"
echo "  工作类: $WORKER_CLASS"
echo "  绑定地址: $BIND"
echo "  超时时间: ${TIMEOUT}秒"
echo ""

# 6. 启动 Gunicorn
echo "启动 Gunicorn..."
exec gunicorn \
    --workers "$WORKERS" \
    --worker-class "$WORKER_CLASS" \
    --bind "$BIND" \
    --timeout "$TIMEOUT" \
    --access-logfile "$ACCESS_LOG" \
    --error-logfile "$ERROR_LOG" \
    --pythonpath "$SCRIPT_DIR" \
    config.wsgi:application








