#!/bin/bash
# 从 SQLite 导出数据并转换为 MySQL 格式的脚本

set -e

echo "========================================"
echo "从 SQLite 导出数据到 MySQL"
echo "========================================"
echo ""

# 配置
SQLITE_DB="${SQLITE_DB:-db.sqlite3}"
OUTPUT_FILE="${OUTPUT_FILE:-echo_from_sqlite.sql}"
DB_NAME="${DB_NAME:-echo}"

# 检查 SQLite 数据库文件是否存在
if [ ! -f "$SQLITE_DB" ]; then
    echo "错误: SQLite 数据库文件不存在: $SQLITE_DB"
    echo ""
    echo "请检查:"
    echo "1. 当前目录是否正确（应该在 backend/ 目录下）"
    echo "2. SQLite 数据库文件是否存在"
    echo ""
    echo "使用方法:"
    echo "  ./export_sqlite_to_mysql.sh [sqlite文件路径]"
    echo ""
    exit 1
fi

echo "SQLite 数据库: $SQLITE_DB"
echo "输出文件: $OUTPUT_FILE"
echo "目标数据库名: $DB_NAME"
echo ""

# 检查是否安装了 sqlite3
if ! command -v sqlite3 &> /dev/null; then
    echo "错误: 未安装 sqlite3"
    echo "安装方法:"
    echo "  Ubuntu/Debian: sudo apt-get install sqlite3"
    echo "  CentOS/RHEL: sudo yum install sqlite"
    exit 1
fi

echo "正在导出数据..."
echo ""

# 创建 Python 脚本文件
PYTHON_SCRIPT=$(mktemp)
cat > "$PYTHON_SCRIPT" << 'PYEOF'
import sqlite3
import sys
import os

sqlite_db = sys.argv[1]
output_file = sys.argv[2]

if not os.path.exists(sqlite_db):
    print(f"错误: SQLite 数据库文件不存在: {sqlite_db}")
    sys.exit(1)

try:
    conn = sqlite3.connect(sqlite_db)
    cursor = conn.cursor()
    
    # 获取所有表名
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]
    
    print(f"找到 {len(tables)} 个表: {', '.join(tables)}")
    print()
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- 从 SQLite 导出的数据\n")
        f.write(f"-- 数据库: {sqlite_db}\n")
        f.write("SET NAMES utf8mb4;\n")
        f.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")
        
        for table in tables:
            print(f"导出表: {table}")
            
            # 获取表结构
            cursor.execute(f"PRAGMA table_info({table})")
            columns = cursor.fetchall()
            
            # 获取数据
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()
            
            if not rows:
                print(f"  表 {table} 为空，跳过")
                continue
            
            # 写入表结构（简化版，只写数据）
            f.write(f"-- 表: {table}\n")
            f.write(f"TRUNCATE TABLE `{table}`;\n")
            
            # 写入数据
            for row in rows:
                # 构建列名
                col_names = [col[1] for col in columns]
                
                # 处理值
                values = []
                for val in row:
                    if val is None:
                        values.append("NULL")
                    elif isinstance(val, (int, float)):
                        values.append(str(val))
                    else:
                        # 转义字符串
                        val_str = str(val).replace("\\", "\\\\").replace("'", "\\'")
                        values.append(f"'{val_str}'")
                
                f.write(f"INSERT INTO `{table}` (`{'`, `'.join(col_names)}`) VALUES ({', '.join(values)});\n")
            
            f.write("\n")
            print(f"  导出了 {len(rows)} 条记录")
        
        f.write("SET FOREIGN_KEY_CHECKS = 1;\n")
    
    conn.close()
    print()
    print(f"✓ 导出完成！文件: {output_file}")
    
except Exception as e:
    print(f"错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYEOF

# 运行 Python 脚本
python3 "$PYTHON_SCRIPT" "$SQLITE_DB" "$OUTPUT_FILE"
EXIT_CODE=$?

# 清理临时文件
rm -f "$PYTHON_SCRIPT"

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "导出成功！"
    echo "========================================"
    echo ""
    echo "下一步:"
    echo "1. 检查导出的 SQL 文件: $OUTPUT_FILE"
    echo "2. 在宝塔面板中导入到 MySQL 数据库"
    echo "   或使用命令: mysql -u echo -p echo < $OUTPUT_FILE"
    echo ""
else
    echo ""
    echo "导出失败，请检查错误信息"
    exit 1
fi
