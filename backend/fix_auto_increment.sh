#!/bin/bash
# 修复 MySQL 数据库中 AUTO_INCREMENT 问题的脚本
# 使用方法：./fix_auto_increment.sh

# 从环境变量读取数据库配置，或使用默认值
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-echo}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo "正在修复 core_dailycheckin 表的 AUTO_INCREMENT 问题..."

if [ -z "$DB_PASSWORD" ]; then
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" <<EOF
ALTER TABLE \`core_dailycheckin\`
MODIFY COLUMN \`id\` BIGINT AUTO_INCREMENT NOT NULL;
EOF
else
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" <<EOF
ALTER TABLE \`core_dailycheckin\`
MODIFY COLUMN \`id\` BIGINT AUTO_INCREMENT NOT NULL;
EOF
fi

if [ $? -eq 0 ]; then
    echo "✅ 修复成功！"
else
    echo "❌ 修复失败，请检查数据库连接和权限。"
    exit 1
fi







