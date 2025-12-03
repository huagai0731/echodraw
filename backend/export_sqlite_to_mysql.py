#!/usr/bin/env python
"""
从 SQLite 导出数据并转换为 MySQL 格式
"""
import sqlite3
import sys
import os
from pathlib import Path

def export_sqlite_to_mysql(sqlite_db, output_file):
    """从 SQLite 导出数据到 MySQL 格式的 SQL 文件"""
    
    if not os.path.exists(sqlite_db):
        print(f"错误: SQLite 数据库文件不存在: {sqlite_db}")
        return False
    
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
        return True
        
    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # 默认参数
    sqlite_db = sys.argv[1] if len(sys.argv) > 1 else "db.sqlite3"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "echo_from_sqlite.sql"
    
    print("=" * 60)
    print("从 SQLite 导出数据到 MySQL")
    print("=" * 60)
    print()
    print(f"SQLite 数据库: {sqlite_db}")
    print(f"输出文件: {output_file}")
    print()
    
    success = export_sqlite_to_mysql(sqlite_db, output_file)
    
    if success:
        print()
        print("=" * 60)
        print("导出成功！")
        print("=" * 60)
        print()
        print("下一步:")
        print(f"1. 检查导出的 SQL 文件: {output_file}")
        print("2. 在宝塔面板中导入到 MySQL 数据库")
        print(f"   或使用命令: mysql -u echo -p echo < {output_file}")
        print()
    else:
        print()
        print("导出失败，请检查错误信息")
        sys.exit(1)








