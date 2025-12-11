#!/usr/bin/env python
"""
支付配置检查脚本
用于诊断支付订单创建失败的问题
"""

import os
import sys
from pathlib import Path

# 添加项目路径
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# 设置 Django 环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.conf import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_wechat_config():
    """检查微信支付配置"""
    print("\n" + "="*60)
    print("检查微信支付配置")
    print("="*60)
    
    issues = []
    
    # 检查必要的环境变量
    required_vars = [
        'WECHAT_APPID',
        'WECHAT_MCHID',
        'WECHAT_APIV3_KEY',
        'WECHAT_CERT_SERIAL_NO',
    ]
    
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            issues.append(f"❌ {var} 未设置")
        else:
            # 隐藏敏感信息
            if 'KEY' in var or 'SECRET' in var:
                display_value = value[:8] + "..." if len(value) > 8 else "***"
            else:
                display_value = value
            print(f"✅ {var} = {display_value}")
    
    # 检查密钥路径
    private_key_path = os.getenv("WECHAT_PRIVATE_KEY_PATH")
    public_key_path = os.getenv("WECHAT_PUBLIC_KEY_PATH")
    private_key_string = os.getenv("WECHAT_PRIVATE_KEY")
    public_key_string = os.getenv("WECHAT_PUBLIC_KEY")
    
    print("\n密钥配置:")
    if private_key_path:
        print(f"  WECHAT_PRIVATE_KEY_PATH = {private_key_path}")
        if os.path.exists(private_key_path):
            if os.path.isfile(private_key_path):
                # 检查文件权限
                import stat
                file_stat = os.stat(private_key_path)
                file_mode = stat.filemode(file_stat.st_mode)
                print(f"  ✅ 文件存在，权限: {file_mode}")
                
                # 检查文件内容
                try:
                    with open(private_key_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if '-----BEGIN PRIVATE KEY-----' in content:
                            print(f"  ✅ 文件格式正确（PRIVATE KEY）")
                        elif '-----BEGIN RSA PRIVATE KEY-----' in content:
                            print(f"  ✅ 文件格式正确（RSA PRIVATE KEY）")
                        else:
                            print(f"  ⚠️  文件格式可能不正确（未找到标准标记）")
                except Exception as e:
                    issues.append(f"❌ 无法读取私钥文件: {e}")
            else:
                issues.append(f"❌ 路径不是文件: {private_key_path}")
        else:
            issues.append(f"❌ 私钥文件不存在: {private_key_path}")
    elif private_key_string:
        print(f"  ✅ 使用 WECHAT_PRIVATE_KEY 环境变量（字符串模式）")
        if len(private_key_string) < 500:
            issues.append(f"⚠️  私钥内容可能不完整（只有 {len(private_key_string)} 字符）")
    else:
        issues.append("❌ 未设置 WECHAT_PRIVATE_KEY_PATH 或 WECHAT_PRIVATE_KEY")
    
    if public_key_path:
        print(f"  WECHAT_PUBLIC_KEY_PATH = {public_key_path}")
        if os.path.exists(public_key_path):
            if os.path.isdir(public_key_path):
                print(f"  ✅ 是目录（证书目录模式）")
            elif os.path.isfile(public_key_path):
                print(f"  ✅ 文件存在")
                try:
                    with open(public_key_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if '-----BEGIN CERTIFICATE-----' in content:
                            print(f"  ✅ 文件格式正确（CERTIFICATE）")
                        elif '-----BEGIN PUBLIC KEY-----' in content:
                            print(f"  ✅ 文件格式正确（PUBLIC KEY）")
                        else:
                            print(f"  ⚠️  文件格式可能不正确")
                except Exception as e:
                    issues.append(f"❌ 无法读取公钥文件: {e}")
            else:
                issues.append(f"❌ 路径既不是文件也不是目录: {public_key_path}")
        else:
            issues.append(f"❌ 公钥文件/目录不存在: {public_key_path}")
    elif public_key_string:
        print(f"  ✅ 使用 WECHAT_PUBLIC_KEY 环境变量（字符串模式）")
    else:
        print(f"  ⚠️  未设置 WECHAT_PUBLIC_KEY_PATH 或 WECHAT_PUBLIC_KEY（将使用自动获取证书模式）")
    
    # 尝试导入和初始化微信支付客户端
    print("\n测试微信支付客户端初始化:")
    try:
        from core.payment.wechat import get_wechatpay_client
        client = get_wechatpay_client()
        print("  ✅ 微信支付客户端初始化成功")
    except ValueError as e:
        issues.append(f"❌ 微信支付配置错误: {e}")
        print(f"  ❌ 配置错误: {e}")
    except Exception as e:
        issues.append(f"❌ 微信支付客户端初始化失败: {e}")
        print(f"  ❌ 初始化失败: {type(e).__name__}: {e}")
        import traceback
        print(f"  详细错误:\n{traceback.format_exc()}")
    
    return issues

def check_alipay_config():
    """检查支付宝配置"""
    print("\n" + "="*60)
    print("检查支付宝配置")
    print("="*60)
    
    issues = []
    
    # 检查必要的环境变量
    required_vars = [
        'ALIPAY_APPID',  # 注意：是 APPID 不是 APP_ID
        'ALIPAY_PRIVATE_KEY',
        'ALIPAY_PUBLIC_KEY',
    ]
    
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            issues.append(f"❌ {var} 未设置")
        else:
            # 隐藏敏感信息
            if 'KEY' in var or 'SECRET' in var:
                display_value = value[:8] + "..." if len(value) > 8 else "***"
            else:
                display_value = value
            print(f"✅ {var} = {display_value}")
    
    # 检查支付宝网关
    gateway = os.getenv('ALIPAY_GATEWAY', 'https://openapi.alipay.com/gateway.do')
    print(f"✅ ALIPAY_GATEWAY = {gateway}")
    
    # 尝试导入支付宝模块
    print("\n测试支付宝模块导入:")
    try:
        from core.payment.alipay import create_alipay_payment_url
        print("  ✅ 支付宝模块导入成功")
    except ImportError as e:
        issues.append(f"❌ 支付宝模块导入失败: {e}")
        print(f"  ❌ 导入失败: {e}")
    except Exception as e:
        issues.append(f"❌ 支付宝模块错误: {e}")
        print(f"  ❌ 错误: {type(e).__name__}: {e}")
    
    return issues

def main():
    print("="*60)
    print("支付配置诊断工具")
    print("="*60)
    
    all_issues = []
    
    # 检查微信支付
    wechat_issues = check_wechat_config()
    all_issues.extend(wechat_issues)
    
    # 检查支付宝
    alipay_issues = check_alipay_config()
    all_issues.extend(alipay_issues)
    
    # 总结
    print("\n" + "="*60)
    print("诊断总结")
    print("="*60)
    
    if all_issues:
        print(f"\n发现 {len(all_issues)} 个问题:\n")
        for issue in all_issues:
            print(f"  {issue}")
        print("\n❌ 配置存在问题，请修复后重试")
        return 1
    else:
        print("\n✅ 所有配置检查通过！")
        return 0

if __name__ == '__main__':
    sys.exit(main())

