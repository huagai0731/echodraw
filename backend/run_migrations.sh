#!/bin/bash
# 运行数据库迁移脚本
# 用于修复部署后的数据库迁移问题

set -e  # 遇到错误时退出

echo "=========================================="
echo "开始运行数据库迁移"
echo "=========================================="

# 进入项目目录
cd "$(dirname "$0")"
echo "当前目录: $(pwd)"

# 检查虚拟环境
if [ -d "venv" ]; then
    echo "激活虚拟环境: venv"
    source venv/bin/activate
elif [ -d ".venv" ]; then
    echo "激活虚拟环境: .venv"
    source .venv/bin/activate
else
    echo "未找到虚拟环境，使用系统 Python"
fi

# 检查环境变量
echo ""
echo "检查环境变量..."
if [ -z "$DB_ENGINE" ]; then
    echo "警告: DB_ENGINE 未设置，将使用默认值"
fi

# 显示当前迁移状态
echo ""
echo "当前迁移状态:"
python manage.py showmigrations core | tail -20

# 运行迁移
echo ""
echo "开始应用迁移..."
python manage.py migrate --verbosity=2

# 再次显示迁移状态
echo ""
echo "迁移后的状态:"
python manage.py showmigrations core | tail -20

echo ""
echo "=========================================="
echo "迁移完成！"
echo "=========================================="
echo ""
echo "请重启应用服务以应用更改："
echo "  sudo systemctl restart gunicorn"
echo "  或"
echo "  sudo supervisorctl restart echo"
echo ""

