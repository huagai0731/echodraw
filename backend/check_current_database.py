"""检查 Django 当前使用的数据库配置"""
import os
import sys

# 设置 Django 环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

try:
    import django
    django.setup()
    
    from django.conf import settings
    from django.db import connection
    
    db = settings.DATABASES['default']
    
    print("=" * 60)
    print("当前 Django 数据库配置")
    print("=" * 60)
    print(f"数据库引擎: {db['ENGINE']}")
    print(f"数据库名称: {db.get('NAME', 'N/A')}")
    print(f"数据库用户: {db.get('USER', 'N/A')}")
    print(f"数据库主机: {db.get('HOST', 'N/A')}")
    print(f"数据库端口: {db.get('PORT', 'N/A')}")
    print()
    
    # 判断是否使用 MySQL
    if 'mysql' in db['ENGINE'].lower():
        print("✅ 当前使用 MySQL 数据库")
        print()
        print("测试数据库连接...")
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT VERSION()")
                version = cursor.fetchone()[0]
                print(f"✅ MySQL 连接成功！")
                print(f"   MySQL 版本: {version}")
                
                # 检查当前数据库
                cursor.execute("SELECT DATABASE()")
                current_db = cursor.fetchone()[0]
                print(f"   当前数据库: {current_db}")
                
                # 列出所有表
                cursor.execute("SHOW TABLES")
                tables = cursor.fetchall()
                print(f"   数据库中的表数量: {len(tables)}")
                if tables:
                    print(f"   表列表: {', '.join([t[0] for t in tables[:10]])}")
                    if len(tables) > 10:
                        print(f"   ... 还有 {len(tables) - 10} 个表")
        except Exception as e:
            print(f"❌ MySQL 连接失败: {e}")
            print()
            print("可能的原因:")
            print("1. MySQL 服务未运行")
            print("2. 数据库 'echo' 不存在")
            print("3. 用户名或密码错误")
            print("4. MySQL 端口不是 3306")
    elif 'sqlite' in db['ENGINE'].lower():
        print("⚠️  当前仍在使用 SQLite 数据库")
        print()
        print("要切换到 MySQL，请确保 .env 文件中设置了:")
        print("  DJANGO_DB_ENGINE=mysql")
        print("  DB_NAME=echo")
        print("  DB_USER=root")
        print("  DB_PASSWORD=你的密码")
    else:
        print(f"当前使用: {db['ENGINE']}")
    
    print("=" * 60)
    
except Exception as e:
    print(f"错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
