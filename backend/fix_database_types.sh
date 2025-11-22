#!/bin/bash
# 修复数据库字段类型问题

set -e

echo "========================================"
echo "修复数据库字段类型"
echo "========================================"
echo ""
echo "⚠️  警告：此操作会修改数据库数据"
echo "建议先备份数据库！"
echo ""
read -p "是否继续？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "正在修复..."
echo ""

# 从 .env 读取配置
if [ -f .env ]; then
    source <(grep -E '^DB_' .env | sed 's/^/export /')
fi

DB_NAME="${DB_NAME:-echo}"
DB_USER="${DB_USER:-echo}"

mysql -u "$DB_USER" -p "$DB_NAME" < fix_database_types.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "修复完成！"
    echo "========================================"
    echo ""
    echo "建议重启 Gunicorn 使更改生效"
else
    echo ""
    echo "修复失败，请检查错误信息"
    exit 1
fi








