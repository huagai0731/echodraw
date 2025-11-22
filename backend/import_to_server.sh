#!/bin/bash
# 在云服务器上导入数据库的脚本

set -e

echo "========================================"
echo "导入数据库到云服务器"
echo "========================================"
echo ""

# 配置（根据实际情况修改）
DB_NAME="${DB_NAME:-echo}"
DB_USER="${DB_USER:-echo}"
SQL_FILE="${1:-echo_backup.sql}"

# 检查 SQL 文件是否存在
if [ ! -f "$SQL_FILE" ]; then
    echo "错误: SQL 文件不存在: $SQL_FILE"
    echo ""
    echo "使用方法:"
    echo "  ./import_to_server.sh [sql文件路径]"
    echo ""
    echo "示例:"
    echo "  ./import_to_server.sh echo_backup.sql"
    echo "  ./import_to_server.sh /root/echo_backup.sql"
    exit 1
fi

echo "数据库名: $DB_NAME"
echo "数据库用户: $DB_USER"
echo "SQL 文件: $SQL_FILE"
echo ""
echo "提示: 请输入数据库密码"
echo ""

# 导入数据库
mysql -u "$DB_USER" -p "$DB_NAME" < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "导入成功！"
    echo "========================================"
    echo ""
    echo "下一步:"
    echo "1. 检查 .env 文件中的数据库配置"
    echo "2. 测试连接: python3 manage.py dbshell"
    echo "3. 运行迁移（如果需要）: python3 manage.py migrate"
    echo "4. 重启 Gunicorn"
    echo ""
else
    echo ""
    echo "========================================"
    echo "导入失败！"
    echo "========================================"
    echo ""
    echo "请检查:"
    echo "- 数据库用户和密码是否正确"
    echo "- 数据库是否存在"
    echo "- SQL 文件是否完整"
    echo "- 字符编码是否正确"
    echo ""
    exit 1
fi








