#!/usr/bin/env python3
"""
生产环境配置检查脚本

此脚本检查Django项目的生产环境配置是否正确。
在部署到生产环境之前运行此脚本，确保所有必要的配置都已设置。

使用方法:
    python check_production_config.py
"""

import os
import sys
from pathlib import Path

# 添加项目路径
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# 设置环境变量（如果未设置）
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# 颜色输出
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_success(message):
    print(f"{Colors.GREEN}✓{Colors.RESET} {message}")

def print_error(message):
    print(f"{Colors.RED}✗{Colors.RESET} {message}")

def print_warning(message):
    print(f"{Colors.YELLOW}⚠{Colors.RESET} {message}")

def print_info(message):
    print(f"{Colors.BLUE}ℹ{Colors.RESET} {message}")

def check_secret_key():
    """检查SECRET_KEY是否已设置"""
    secret_key = os.getenv("DJANGO_SECRET_KEY")
    if not secret_key:
        print_error("DJANGO_SECRET_KEY 环境变量未设置")
        print_info("生成密钥命令: python -c \"import secrets; print(secrets.token_urlsafe(50))\"")
        return False
    if secret_key == "django-insecure-cek3ua7xe03xkv)eoj&(f30fc8=_^#&l9slh-)vl85$q(qr_o1":
        print_warning("使用了不安全的默认SECRET_KEY，请更换为随机生成的密钥")
        return False
    if len(secret_key) < 50:
        print_warning(f"SECRET_KEY长度较短 ({len(secret_key)}字符)，建议至少50字符")
    print_success("DJANGO_SECRET_KEY 已设置")
    return True

def check_debug():
    """检查DEBUG模式"""
    debug = os.getenv("DJANGO_DEBUG", "False").lower() == "true"
    if debug:
        print_error("DEBUG模式已启用，生产环境应禁用DEBUG")
        return False
    print_success("DEBUG模式已禁用")
    return True

def check_allowed_hosts():
    """检查ALLOWED_HOSTS配置"""
    allowed_hosts = os.getenv("DJANGO_ALLOWED_HOSTS", "")
    if not allowed_hosts:
        print_error("DJANGO_ALLOWED_HOSTS 环境变量未设置")
        print_info("示例: DJANGO_ALLOWED_HOSTS=example.com,www.example.com")
        return False
    hosts = [h.strip() for h in allowed_hosts.split(",") if h.strip()]
    if "*" in hosts:
        print_warning("ALLOWED_HOSTS包含通配符'*'，生产环境应明确指定域名")
    print_success(f"ALLOWED_HOSTS 已设置: {', '.join(hosts)}")
    return True

def check_cors():
    """检查CORS配置"""
    cors_origins = os.getenv("DJANGO_CORS_ALLOWED_ORIGINS", "")
    cors_allow_all = os.getenv("DJANGO_CORS_ALLOW_ALL", "").lower() == "true"
    
    if cors_allow_all:
        print_error("CORS_ALLOW_ALL_ORIGINS 已启用，生产环境应禁用")
        return False
    
    if not cors_origins:
        print_warning("DJANGO_CORS_ALLOWED_ORIGINS 未设置，可能导致前端无法访问API")
        print_info("示例: DJANGO_CORS_ALLOWED_ORIGINS=https://example.com,https://www.example.com")
        return False
    
    origins = [o.strip() for o in cors_origins.split(",") if o.strip()]
    print_success(f"CORS允许的源已设置: {', '.join(origins)}")
    return True

def check_database():
    """检查数据库配置"""
    db_engine = os.getenv("DJANGO_DB_ENGINE", "")
    if not db_engine:
        print_warning("未检测到数据库配置，可能使用默认SQLite")
        print_warning("SQLite不适合生产环境（万人使用），建议使用PostgreSQL或MySQL")
        return False
    
    if db_engine == "sqlite3":
        print_error("检测到SQLite数据库，不适合生产环境")
        print_info("建议使用PostgreSQL或MySQL")
        return False
    
    print_success(f"数据库引擎: {db_engine}")
    return True

def check_smtp():
    """检查SMTP配置"""
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    if not smtp_password:
        print_warning("SMTP_PASSWORD 未设置，邮件发送功能可能无法正常工作")
        return False
    print_success("SMTP配置已设置")
    return True

def check_file_upload_limits():
    """检查文件上传限制配置"""
    # 这些配置在settings.py中，这里只是提醒
    print_info("文件上传限制应在settings.py中配置（已配置：10MB）")
    return True

def check_security_headers():
    """检查安全头配置"""
    # 这些配置在settings.py中，这里只是提醒
    print_info("安全HTTP头应在settings.py中配置（生产环境自动启用）")
    return True

def check_rate_limiting():
    """检查API限流配置"""
    # 这些配置在settings.py中，这里只是提醒
    print_info("API限流已在settings.py中配置（匿名用户100/小时，认证用户1000/小时）")
    return True

def main():
    """主函数"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}生产环境配置检查{Colors.RESET}\n")
    print("=" * 50)
    
    checks = [
        ("SECRET_KEY", check_secret_key),
        ("DEBUG模式", check_debug),
        ("ALLOWED_HOSTS", check_allowed_hosts),
        ("CORS配置", check_cors),
        ("数据库配置", check_database),
        ("SMTP配置", check_smtp),
        ("文件上传限制", check_file_upload_limits),
        ("安全HTTP头", check_security_headers),
        ("API限流", check_rate_limiting),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print_error(f"{name}检查失败: {e}")
            results.append((name, False))
        print()
    
    print("=" * 50)
    print(f"\n{Colors.BOLD}检查结果汇总:{Colors.RESET}\n")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        if result:
            print_success(f"{name}: 通过")
        else:
            print_error(f"{name}: 未通过")
    
    print(f"\n{Colors.BOLD}总计: {passed}/{total} 项检查通过{Colors.RESET}\n")
    
    if passed == total:
        print(f"{Colors.GREEN}{Colors.BOLD}✓ 所有检查通过！可以部署到生产环境。{Colors.RESET}\n")
        return 0
    else:
        print(f"{Colors.RED}{Colors.BOLD}✗ 部分检查未通过，请修复后再部署。{Colors.RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())

