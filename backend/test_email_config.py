#!/usr/bin/env python
"""
测试邮箱配置脚本
用于检查SMTP配置是否正确
"""
import os
import sys
from pathlib import Path

# 添加项目路径
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# 加载环境变量
from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".env.local")
load_dotenv(BASE_DIR / ".env.development", override=True)

# 设置Django环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.conf import settings
from django.core.mail import send_mail
from django.core.mail.backends.smtp import EmailBackend

def test_email_config():
    """测试邮箱配置"""
    print("=" * 60)
    print("邮箱配置检查")
    print("=" * 60)
    
    # 检查配置
    print(f"\nSMTP服务器: {settings.EMAIL_HOST}")
    print(f"SMTP端口: {settings.EMAIL_PORT}")
    print(f"使用SSL: {settings.EMAIL_USE_SSL}")
    print(f"使用TLS: {settings.EMAIL_USE_TLS}")
    print(f"发件人邮箱: {settings.EMAIL_HOST_USER}")
    print(f"发件人地址: {settings.DEFAULT_FROM_EMAIL}")
    print(f"密码已设置: {'是' if settings.EMAIL_HOST_PASSWORD else '否'}")
    if settings.EMAIL_HOST_PASSWORD:
        print(f"密码长度: {len(settings.EMAIL_HOST_PASSWORD)} 字符")
    
    # 检查环境变量
    print("\n环境变量检查:")
    print(f"SMTP_HOST: {os.getenv('SMTP_HOST', '未设置')}")
    print(f"SMTP_PORT: {os.getenv('SMTP_PORT', '未设置')}")
    print(f"SMTP_USERNAME: {os.getenv('SMTP_USERNAME', '未设置')}")
    print(f"SMTP_PASSWORD: {'已设置' if os.getenv('SMTP_PASSWORD') else '未设置'}")
    if os.getenv('SMTP_PASSWORD'):
        print(f"SMTP_PASSWORD长度: {len(os.getenv('SMTP_PASSWORD'))} 字符")
    
    # 测试连接
    print("\n" + "=" * 60)
    print("测试SMTP连接")
    print("=" * 60)
    
    try:
        backend = EmailBackend(
            host=settings.EMAIL_HOST,
            port=settings.EMAIL_PORT,
            username=settings.EMAIL_HOST_USER,
            password=settings.EMAIL_HOST_PASSWORD,
            use_tls=settings.EMAIL_USE_TLS,
            use_ssl=settings.EMAIL_USE_SSL,
            timeout=settings.EMAIL_TIMEOUT,
        )
        
        # 尝试打开连接
        backend.open()
        print("✓ SMTP连接成功！")
        backend.close()
        
        # 测试发送邮件
        print("\n" + "=" * 60)
        print("测试发送邮件")
        print("=" * 60)
        
        test_email = input("\n请输入测试邮箱地址（按Enter跳过）: ").strip()
        if test_email:
            try:
                send_mail(
                    subject="EchoDraw 邮箱配置测试",
                    message="这是一封测试邮件，用于验证邮箱配置是否正确。\n\n如果你收到这封邮件，说明配置成功！",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[test_email],
                    fail_silently=False,
                )
                print(f"✓ 测试邮件已发送到 {test_email}，请检查收件箱（包括垃圾邮件文件夹）")
            except Exception as e:
                print(f"✗ 发送邮件失败: {e}")
                print(f"错误类型: {type(e).__name__}")
                import traceback
                traceback.print_exc()
        else:
            print("跳过发送测试邮件")
            
    except Exception as e:
        print(f"✗ SMTP连接失败: {e}")
        print(f"错误类型: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        
        print("\n可能的原因:")
        print("1. SMTP服务器地址或端口不正确")
        print("2. 邮箱授权码错误或已过期")
        print("3. 163邮箱的SMTP服务未开启")
        print("4. 网络连接问题")
        print("5. 防火墙阻止了SMTP连接")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    test_email_config()

