#!/usr/bin/env python
"""
从 SQLite 导出数据并转换为 MySQL 格式（包含表结构）
"""
import sqlite3
import sys
import os
import re

def sqlite_to_mysql_type(sqlite_type):
    """将 SQLite 类型转换为 MySQL 类型"""
    sqlite_type = sqlite_type.upper()
    
    type_mapping = {
        'INTEGER': 'INT',
        'TEXT': 'TEXT',
        'REAL': 'DOUBLE',
        'BLOB': 'BLOB',
        'NUMERIC': 'DECIMAL(10,2)',
        'BOOLEAN': 'TINYINT(1)',
        'DATE': 'DATE',
        'DATETIME': 'DATETIME',
        'TIMESTAMP': 'TIMESTAMP',
    }
    
    # 处理带长度的类型，如 VARCHAR(255)
    if '(' in sqlite_type:
        return sqlite_type
    
    return type_mapping.get(sqlite_type, 'TEXT')

def export_sqlite_to_mysql(sqlite_db, output_file):
    """从 SQLite 导出数据到 MySQL 格式的 SQL 文件（包含表结构）"""
    
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
            f.write("-- 从 SQLite 导出的数据（包含表结构）\n")
            f.write(f"-- 数据库: {sqlite_db}\n")
            f.write("SET NAMES utf8mb4;\n")
            f.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")
            
            for table in tables:
                print(f"处理表: {table}")
                
                # 获取表结构
                cursor.execute(f"PRAGMA table_info({table})")
                columns = cursor.fetchall()
                
                # 获取主键信息
                cursor.execute(f"PRAGMA table_info({table})")
                pk_columns = [col[1] for col in columns if col[5] == 1]
                
                # 创建表结构
                f.write(f"-- 表: {table}\n")
                f.write(f"DROP TABLE IF EXISTS `{table}`;\n")
                f.write(f"CREATE TABLE `{table}` (\n")
                
                col_definitions = []
                for col in columns:
                    col_name = col[1]
                    col_type = sqlite_to_mysql_type(col[2])
                    not_null = "NOT NULL" if col[3] else ""
                    default_val = f"DEFAULT {col[4]}" if col[4] is not None else ""
                    
                    col_def = f"  `{col_name}` {col_type} {not_null} {default_val}".strip()
                    col_definitions.append(col_def)
                
                f.write(",\n".join(col_definitions))
                
                # 添加主键
                if pk_columns:
                    f.write(f",\n  PRIMARY KEY (`{'`, `'.join(pk_columns)}`)")
                
                f.write("\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n")
                
                # 获取数据
                cursor.execute(f"SELECT * FROM {table}")
                rows = cursor.fetchall()
                
                if rows:
                    print(f"  导出了 {len(rows)} 条记录")
                    
                    # 写入数据
                    for row in rows:
                        # 构建列名
                        col_names = [col[1] for col in columns]
                        
                        # 处理值
                        values = []
                        for i, val in enumerate(row):
                            col_info = columns[i]
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
                else:
                    print(f"  表 {table} 为空")
                    f.write("\n")
            
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
    output_file = sys.argv[2] if len(sys.argv) > 2 else "echo_from_sqlite_with_schema.sql"
    
    print("=" * 60)
    print("从 SQLite 导出数据到 MySQL（包含表结构）")
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








