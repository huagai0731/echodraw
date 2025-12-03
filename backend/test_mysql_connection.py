"""
测试 MySQL 连接的脚本
尝试常见的默认配置来连接 MySQL
"""
import os
import sys

# 尝试导入 MySQL 驱动
try:
    import MySQLdb
    mysql_available = True
except ImportError:
    try:
        import pymysql
        pymysql.install_as_MySQLdb()
        mysql_available = True
    except ImportError:
        print("错误: 未找到 MySQL 驱动")
        print("请运行: pip install mysqlclient 或 pip install pymysql")
        sys.exit(1)

from dotenv import load_dotenv

# 加载环境变量
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env.local"))
load_dotenv(os.path.join(BASE_DIR, ".env.development"), override=True)

# 常见的默认配置
common_configs = [
    {"user": "root", "password": "", "host": "localhost", "port": 3306},
    {"user": "root", "password": "root", "host": "localhost", "port": 3306},
    {"user": "root", "password": "123456", "host": "localhost", "port": 3306},
    {"user": "root", "password": "password", "host": "localhost", "port": 3306},
    {"user": "root", "password": "admin", "host": "localhost", "port": 3306},
]

# 从环境变量读取配置
env_config = {
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
}

print("=" * 60)
print("MySQL 连接测试工具")
print("=" * 60)
print()

# 先测试环境变量中的配置
print("1. 测试 .env 文件中的配置:")
print(f"   用户: {env_config['user']}")
print(f"   主机: {env_config['host']}")
print(f"   端口: {env_config['port']}")
print(f"   密码: {'*' * len(env_config['password']) if env_config['password'] else '(空)'}")
print()

try:
    conn = MySQLdb.connect(
        user=env_config["user"],
        password=env_config["password"],
        host=env_config["host"],
        port=env_config["port"],
    )
    print("✅ 连接成功！")
    print(f"   MySQL 版本: {conn.get_server_info()}")
    
    cursor = conn.cursor()
    cursor.execute("SELECT USER(), DATABASE()")
    user, db = cursor.fetchone()
    print(f"   当前用户: {user}")
    print(f"   当前数据库: {db if db else '(无)'}")
    
    # 列出所有数据库
    cursor.execute("SHOW DATABASES")
    databases = [row[0] for row in cursor.fetchall()]
    print(f"   可用数据库: {', '.join(databases)}")
    
    cursor.close()
    conn.close()
    print()
    print("=" * 60)
    print("✅ 配置正确！请使用以下信息更新 .env 文件:")
    print("=" * 60)
    print(f"DB_USER={env_config['user']}")
    print(f"DB_PASSWORD={env_config['password']}")
    print(f"DB_HOST={env_config['host']}")
    print(f"DB_PORT={env_config['port']}")
    sys.exit(0)
    
except MySQLdb.Error as e:
    print(f"❌ 连接失败: {e}")
    print()

# 如果环境变量配置失败，尝试常见默认配置
if env_config["password"] == "your_password_here" or not env_config["password"]:
    print("2. 尝试常见的默认配置:")
    print()
    
    for i, config in enumerate(common_configs, 1):
        print(f"   尝试配置 {i}: 用户={config['user']}, 密码={'*' * len(config['password']) if config['password'] else '(空)'}")
        try:
            conn = MySQLdb.connect(
                user=config["user"],
                password=config["password"],
                host=config["host"],
                port=config["port"],
            )
            print(f"   ✅ 连接成功！")
            print(f"   MySQL 版本: {conn.get_server_info()}")
            
            cursor = conn.cursor()
            cursor.execute("SELECT USER()")
            user = cursor.fetchone()[0]
            print(f"   当前用户: {user}")
            
            # 列出所有数据库
            cursor.execute("SHOW DATABASES")
            databases = [row[0] for row in cursor.fetchall()]
            print(f"   可用数据库: {', '.join(databases)}")
            
            cursor.close()
            conn.close()
            print()
            print("=" * 60)
            print("✅ 找到可用的配置！请使用以下信息更新 .env 文件:")
            print("=" * 60)
            print(f"DB_USER={config['user']}")
            print(f"DB_PASSWORD={config['password']}")
            print(f"DB_HOST={config['host']}")
            print(f"DB_PORT={config['port']}")
            sys.exit(0)
            
        except MySQLdb.Error as e:
            print(f"   ❌ 失败: {e}")
            print()

print()
print("=" * 60)
print("❌ 无法自动找到可用的 MySQL 配置")
print("=" * 60)
print()
print("请尝试以下方法:")
print()
print("方法 1: 查找 MySQL 配置文件")
print("   - 检查 MySQL 安装目录下的 my.ini 或 my.cnf 文件")
print("   - 通常在: C:\\ProgramData\\MySQL\\MySQL Server X.X\\my.ini")
print()
print("方法 2: 重置 MySQL root 密码")
print("   1. 停止 MySQL 服务")
print("   2. 使用 --skip-grant-tables 启动 MySQL")
print("   3. 使用 mysqladmin 或直接 SQL 修改密码")
print()
print("方法 3: 查看安装时的记录")
print("   - 检查安装 MySQL 时的笔记或文档")
print("   - 检查是否有保存密码的文档")
print()
print("方法 4: 如果使用集成环境 (XAMPP/WAMP)")
print("   - XAMPP 默认用户: root, 密码: (空)")
print("   - WAMP 默认用户: root, 密码: (空)")
print()
sys.exit(1)

