#!/bin/bash
# 修复 SQLite 数据库文件权限的脚本

# 获取脚本所在目录（backend目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="$SCRIPT_DIR/db.sqlite3"
DB_DIR="$SCRIPT_DIR"

echo "正在修复数据库文件权限..."

# 检查数据库文件是否存在
if [ ! -f "$DB_FILE" ]; then
    echo "警告: 数据库文件不存在: $DB_FILE"
    echo "将创建数据库文件..."
    # 确保目录存在且有写权限
    mkdir -p "$DB_DIR"
fi

# 修复数据库文件权限
if [ -f "$DB_FILE" ]; then
    # 设置文件权限：所有者可读写，组和其他用户可读
    chmod 644 "$DB_FILE"
    echo "✓ 已设置数据库文件权限: $DB_FILE"
else
    # 如果文件不存在，确保目录有写权限以便创建
    chmod 755 "$DB_DIR"
    echo "✓ 已设置目录权限，可以创建数据库文件: $DB_DIR"
fi

# 修复目录权限（确保可以创建临时文件）
chmod 755 "$DB_DIR"
echo "✓ 已设置目录权限: $DB_DIR"

# 检查当前用户
CURRENT_USER=$(whoami)
echo "当前用户: $CURRENT_USER"

# 如果文件存在，检查所有者
if [ -f "$DB_FILE" ]; then
    FILE_OWNER=$(stat -c '%U' "$DB_FILE" 2>/dev/null || stat -f '%Su' "$DB_FILE" 2>/dev/null)
    echo "数据库文件所有者: $FILE_OWNER"
    
    # 如果所有者不是当前用户，尝试更改所有者
    if [ "$FILE_OWNER" != "$CURRENT_USER" ]; then
        echo "警告: 数据库文件所有者是 $FILE_OWNER，当前用户是 $CURRENT_USER"
        echo "尝试更改文件所有者..."
        sudo chown "$CURRENT_USER:$CURRENT_USER" "$DB_FILE" 2>/dev/null || {
            echo "无法更改文件所有者，请手动运行:"
            echo "  sudo chown $CURRENT_USER:$CURRENT_USER $DB_FILE"
        }
    fi
fi

echo ""
echo "权限修复完成！"
echo ""
echo "如果问题仍然存在，请检查："
echo "1. 数据库文件所在目录是否有写权限"
echo "2. 文件系统是否挂载为只读"
echo "3. SELinux 或其他安全策略是否限制了访问"
echo ""
echo "手动修复命令："
echo "  chmod 644 $DB_FILE"
echo "  chmod 755 $DB_DIR"
echo "  sudo chown $CURRENT_USER:$CURRENT_USER $DB_FILE"

