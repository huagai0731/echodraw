# backend/check_wechat_cert.py
"""
检查微信支付平台证书格式
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

print("=" * 50)
print("检查微信支付平台证书格式")
print("=" * 50)

# 获取平台公钥
public_key_string = os.getenv('WECHAT_PUBLIC_KEY')
public_key_path = os.getenv('WECHAT_PUBLIC_KEY_PATH')

if public_key_string:
    print("\n【从环境变量读取平台公钥】")
    print(f"长度: {len(public_key_string)} 字符")
    print(f"前100个字符: {public_key_string[:100]}")
    
    # 检查格式
    if '-----BEGIN CERTIFICATE-----' in public_key_string:
        print("✅ 格式: CERTIFICATE")
        print("\n⚠️  注意: wechatpayv3 库需要 PUBLIC KEY 格式，不是 CERTIFICATE 格式")
        print("   需要从证书中提取公钥")
        
        # 尝试提取公钥
        try:
            from cryptography import x509
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.backends import default_backend
            
            cert = x509.load_pem_x509_certificate(public_key_string.encode('utf-8'), default_backend())
            public_key_obj = cert.public_key()
            
            # 转换为 PEM 格式的 PUBLIC KEY
            public_key_pem = public_key_obj.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ).decode('utf-8')
            
            print("\n✅ 成功提取公钥！")
            print("\n转换后的 PUBLIC KEY 格式:")
            print("-" * 50)
            print(public_key_pem)
            print("-" * 50)
            print("\n💡 请将上面的内容替换 .env 文件中的 WECHAT_PUBLIC_KEY")
            
        except Exception as e:
            print(f"\n❌ 提取公钥失败: {e}")
            print("\n可能的原因:")
            print("1. 证书内容不完整")
            print("2. 证书格式不正确")
            print("3. 证书内容被截断")
            
    elif '-----BEGIN PUBLIC KEY-----' in public_key_string:
        print("✅ 格式: PUBLIC KEY（正确格式）")
    else:
        print("❌ 无法识别格式")
        print("   应该以 '-----BEGIN CERTIFICATE-----' 或 '-----BEGIN PUBLIC KEY-----' 开头")

elif public_key_path and os.path.exists(public_key_path):
    print(f"\n【从文件读取平台公钥】")
    print(f"路径: {public_key_path}")
    with open(public_key_path, 'r', encoding='utf-8') as f:
        content = f.read()
        print(f"长度: {len(content)} 字符")
        print(f"前100个字符: {content[:100]}")
        
        if '-----BEGIN CERTIFICATE-----' in content:
            print("✅ 格式: CERTIFICATE")
            print("\n⚠️  需要转换为 PUBLIC KEY 格式")
        elif '-----BEGIN PUBLIC KEY-----' in content:
            print("✅ 格式: PUBLIC KEY（正确格式）")
        else:
            print("❌ 无法识别格式")
else:
    print("\n❌ 未找到平台公钥配置")

print("\n" + "=" * 50)

