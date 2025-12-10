#!/usr/bin/env python
"""
检查支付宝配置的脚本

使用方法：
    python check_alipay_config.py

或者在 Django 环境中：
    python manage.py shell < check_alipay_config.py
"""
import os
import sys
import django

# 设置 Django 环境
if __name__ == "__main__":
    # 尝试从当前目录或父目录找到 manage.py
    if os.path.exists("manage.py"):
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
        django.setup()
    else:
        print("错误: 请在 backend 目录下运行此脚本")
        sys.exit(1)

def check_alipay_config():
    """检查支付宝配置"""
    print("=" * 60)
    print("支付宝配置检查")
    print("=" * 60)
    
    # 检查必需的环境变量
    required_vars = [
        "ALIPAY_APPID",
        "ALIPAY_PRIVATE_KEY",
        "ALIPAY_PUBLIC_KEY",
        "ALIPAY_NOTIFY_URL",
    ]
    
    optional_vars = [
        "ALIPAY_RETURN_URL",
        "ALIPAY_GATEWAY",
        "ALIPAY_SIGN_TYPE",
        "ALIPAY_DEBUG",
    ]
    
    print("\n【必需的环境变量】")
    all_required_set = True
    for var in required_vars:
        value = os.getenv(var)
        if value:
            # 对于密钥，只显示前10个字符和后10个字符
            if "KEY" in var:
                if len(value) > 20:
                    display_value = f"{value[:10]}...{value[-10:]}"
                else:
                    display_value = "***" * 5
            else:
                display_value = value
            print(f"  ✅ {var}: {display_value}")
        else:
            print(f"  ❌ {var}: 未设置")
            all_required_set = False
    
    print("\n【可选的环境变量】")
    for var in optional_vars:
        value = os.getenv(var)
        if value:
            print(f"  ✅ {var}: {value}")
        else:
            default = {
                "ALIPAY_GATEWAY": "https://openapi.alipay.com/gateway.do",
                "ALIPAY_SIGN_TYPE": "RSA2",
                "ALIPAY_DEBUG": "False",
            }.get(var, "未设置")
            print(f"  ⚠️  {var}: 未设置 (默认: {default})")
    
    if not all_required_set:
        print("\n❌ 错误: 缺少必需的环境变量！")
        print("\n请设置以下环境变量：")
        for var in required_vars:
            if not os.getenv(var):
                print(f"  - {var}")
        return False
    
    # 尝试创建支付宝客户端
    print("\n【测试支付宝客户端创建】")
    try:
        from core.payment.alipay import get_alipay_client
        alipay = get_alipay_client()
        print("  ✅ 支付宝客户端创建成功")
        
        # 检查客户端配置
        print("\n【客户端配置信息】")
        appid = os.getenv("ALIPAY_APPID")
        gateway = os.getenv("ALIPAY_GATEWAY", "https://openapi.alipay.com/gateway.do")
        debug = os.getenv("ALIPAY_DEBUG", "False").lower() == "true"
        
        print(f"  应用ID: {appid}")
        print(f"  网关地址: {gateway}")
        print(f"  调试模式: {debug}")
        print(f"  签名类型: {os.getenv('ALIPAY_SIGN_TYPE', 'RSA2')}")
        
        # 测试网络连接（可选）
        print("\n【网络连接测试】")
        try:
            import urllib.request
            import ssl
            
            # 创建不验证证书的上下文（仅用于测试）
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            req = urllib.request.Request(gateway)
            req.add_header("User-Agent", "EchoDraw-Config-Checker/1.0")
            
            with urllib.request.urlopen(req, timeout=5, context=ctx) as response:
                print(f"  ✅ 可以连接到支付宝网关: {gateway}")
        except Exception as e:
            print(f"  ⚠️  无法连接到支付宝网关: {e}")
            print("     提示: 这可能是网络问题或防火墙设置")
        
        print("\n" + "=" * 60)
        print("✅ 支付宝配置检查完成！")
        print("=" * 60)
        return True
        
    except ValueError as e:
        print(f"  ❌ 配置错误: {e}")
        print("\n请检查环境变量是否正确设置。")
        return False
    except Exception as e:
        print(f"  ❌ 创建客户端失败: {e}")
        print(f"  错误类型: {type(e).__name__}")
        import traceback
        print("\n详细错误信息:")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = check_alipay_config()
    sys.exit(0 if success else 1)

