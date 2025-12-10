#!/bin/bash
# 一键修复数据库脚本
# 自动运行所有必要的迁移和修复步骤

set -e  # 遇到错误立即退出

echo "============================================================"
echo "数据库一键修复脚本"
echo "============================================================"

# 进入backend目录
cd "$(dirname "$0")"

echo ""
echo "步骤1: 检查迁移状态..."
python manage.py showmigrations

echo ""
echo "步骤2: 应用所有迁移..."
python manage.py migrate --noinput

echo ""
echo "步骤3: 运行迁移确保脚本..."
python ensure_migrations.py

echo ""
echo "步骤4: 运行数据库结构修复脚本..."
python fix_database_structure.py

echo ""
echo "============================================================"
echo "修复完成！"
echo "============================================================"









