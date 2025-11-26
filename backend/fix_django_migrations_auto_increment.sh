#!/bin/bash
# 修复 django_migrations 表的 AUTO_INCREMENT 问题
# 使用方法：./fix_django_migrations_auto_increment.sh

# 从环境变量读取数据库配置，或使用默认值
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-echo}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo "=========================================="
echo "修复 django_migrations 表的 AUTO_INCREMENT 问题"
echo "=========================================="
echo "数据库: $DB_NAME @ $DB_HOST:$DB_PORT"
echo ""

# 检查表是否存在
if [ -z "$DB_PASSWORD" ]; then
    TABLE_EXISTS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" -sN -e "SHOW TABLES LIKE 'django_migrations';" 2>/dev/null)
else
    TABLE_EXISTS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SHOW TABLES LIKE 'django_migrations';" 2>/dev/null)
fi

if [ -z "$TABLE_EXISTS" ]; then
    echo "❌ 错误: django_migrations 表不存在"
    echo "这可能意味着数据库尚未初始化。请先运行: python manage.py migrate"
    exit 1
fi

echo "✅ django_migrations 表存在"
echo "正在修复 AUTO_INCREMENT..."
echo ""

if [ -z "$DB_PASSWORD" ]; then
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" <<EOF
ALTER TABLE \`django_migrations\`
MODIFY COLUMN \`id\` INT AUTO_INCREMENT NOT NULL;
EOF
else
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" <<EOF
ALTER TABLE \`django_migrations\`
MODIFY COLUMN \`id\` INT AUTO_INCREMENT NOT NULL;
EOF
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 修复成功！"
    echo ""
    echo "现在可以重新运行迁移："
    echo "  python manage.py migrate"
else
    echo ""
    echo "❌ 修复失败，请检查数据库连接和权限。"
    exit 1
fi







