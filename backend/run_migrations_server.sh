#!/bin/bash
# 云服务器运行数据库迁移脚本

set -e  # 遇到错误时退出

echo "=========================================="
echo "开始运行数据库迁移"
echo "=========================================="

# 进入项目目录（根据实际部署路径调整）
cd /path/to/your/project/backend  # 请修改为实际的项目路径

# 激活虚拟环境（如果使用虚拟环境）
if [ -d "venv" ]; then
    echo "激活虚拟环境: venv"
    source venv/bin/activate
elif [ -d ".venv" ]; then
    echo "激活虚拟环境: .venv"
    source .venv/bin/activate
fi

# 显示当前迁移状态
echo ""
echo "当前迁移状态:"
python manage.py showmigrations

# 运行迁移
echo ""
echo "开始应用迁移..."
python manage.py migrate --verbosity=2

# 再次显示迁移状态
echo ""
echo "迁移后的状态:"
python manage.py showmigrations

echo ""
echo "=========================================="
echo "迁移完成！"
echo "=========================================="
echo ""
echo "请重启应用服务以应用更改："
echo "  sudo systemctl restart gunicorn"
echo "  或"
echo "  sudo supervisorctl restart echo"
echo "  或"
echo "  pm2 restart echo"
echo ""

