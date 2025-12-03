#!/bin/bash
# 从云服务器的 MySQL 导出数据库

set -e

echo "========================================"
echo "从云服务器 MySQL 导出数据库"
echo "========================================"
echo ""

# 从 .env 文件读取配置（如果存在）
if [ -f .env ]; then
    source <(grep -E '^DB_' .env | sed 's/^/export /')
fi

# 配置（可以从环境变量或参数获取）
DB_NAME="${DB_NAME:-echo}"
DB_USER="${DB_USER:-echo}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
OUTPUT_FILE="${1:-echo_backup_$(date +%Y%m%d_%H%M%S).sql}"

echo "数据库配置:"
echo "  主机: $DB_HOST"
echo "  端口: $DB_PORT"
echo "  数据库名: $DB_NAME"
echo "  用户名: $DB_USER"
echo "  输出文件: $OUTPUT_FILE"
echo ""
echo "提示: 请输入数据库密码"
echo ""

# 检查 mysqldump 是否存在
if ! command -v mysqldump &> /dev/null; then
    echo "错误: 未安装 mysqldump"
    echo "安装方法:"
    echo "  Ubuntu/Debian: sudo apt-get install mysql-client"
    echo "  CentOS/RHEL: sudo yum install mysql"
    exit 1
fi

# 导出数据库
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p \
    --default-character-set=utf8mb4 \
    --single-transaction \
    --routines \
    --triggers \
    "$DB_NAME" > "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    file_size=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo ""
    echo "========================================"
    echo "导出成功！"
    echo "========================================"
    echo "文件: $OUTPUT_FILE"
    echo "大小: $file_size"
    echo ""
    echo "下一步:"
    echo "1. 下载文件到本地（如果需要）"
    echo "2. 或直接导入到新的数据库"
    echo ""
else
    echo ""
    echo "========================================"
    echo "导出失败！"
    echo "========================================"
    echo "请检查:"
    echo "- 数据库用户和密码是否正确"
    echo "- 数据库是否存在"
    echo "- 用户是否有导出权限"
    exit 1
fi








