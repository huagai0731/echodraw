#!/usr/bin/env python
"""
诊断脚本：检查 Gunicorn 启动前的环境配置
"""
import os
import sys
from pathlib import Path

# 设置项目路径
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

print("=" * 60)
print("Gunicorn 启动环境诊断")
print("=" * 60)

# 1. 检查 Python 版本
print(f"\n1. Python 版本: {sys.version}")

# 2. 检查工作目录
print(f"\n2. 当前工作目录: {os.getcwd()}")
print(f"   项目目录: {BASE_DIR}")

# 3. 检查环境变量
print("\n3. 环境变量检查:")
required_vars = ["DJANGO_SECRET_KEY", "DJANGO_ALLOWED_HOSTS"]
for var in required_vars:
    value = os.getenv(var)
    if value:
        # 隐藏敏感信息
        if "SECRET" in var or "KEY" in var:
            display_value = f"{value[:10]}..." if len(value) > 10 else "***"
        else:
            display_value = value
        print(f"   ✓ {var} = {display_value}")
    else:
        print(f"   ✗ {var} 未设置")

# 4. 检查 .env 文件
print("\n4. 环境文件检查:")
env_files = [".env", ".env.local", ".env.development"]
for env_file in env_files:
    env_path = BASE_DIR / env_file
    if env_path.exists():
        print(f"   ✓ {env_file} 存在")
    else:
        print(f"   - {env_file} 不存在（可选）")

# 5. 检查 Django 设置
print("\n5. Django 设置检查:")
try:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    django.setup()
    from django.conf import settings
    
    print(f"   ✓ Django 版本: {django.get_version()}")
    print(f"   ✓ DEBUG = {settings.DEBUG}")
    print(f"   ✓ ALLOWED_HOSTS = {settings.ALLOWED_HOSTS}")
    print(f"   ✓ SECRET_KEY 已设置: {bool(settings.SECRET_KEY)}")
    
    # 检查数据库配置
    db_config = settings.DATABASES.get("default", {})
    db_engine = db_config.get("ENGINE", "")
    print(f"   ✓ 数据库引擎: {db_engine}")
    
except Exception as e:
    print(f"   ✗ Django 设置加载失败: {e}")
    print(f"   错误类型: {type(e).__name__}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 6. 检查 WSGI 应用
print("\n6. WSGI 应用检查:")
try:
    from config.wsgi import application
    print(f"   ✓ WSGI application 导入成功")
    print(f"   ✓ application 类型: {type(application)}")
except Exception as e:
    print(f"   ✗ WSGI 应用导入失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 7. 检查依赖包
print("\n7. 关键依赖包检查:")
required_packages = ["django", "gunicorn", "dotenv"]
for package in required_packages:
    try:
        __import__(package)
        print(f"   ✓ {package} 已安装")
    except ImportError:
        print(f"   ✗ {package} 未安装")

print("\n" + "=" * 60)
print("诊断完成！如果看到 ✗ 标记，请修复相应问题。")
print("=" * 60)








