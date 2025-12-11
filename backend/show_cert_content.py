# backend/show_cert_content.py
"""
显示证书内容（用于调试）
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

public_key_string = os.getenv('WECHAT_PUBLIC_KEY')

if public_key_string:
    print("=" * 50)
    print("证书内容（完整）:")
    print("=" * 50)
    print(public_key_string)
    print("=" * 50)
    print(f"\n长度: {len(public_key_string)} 字符")
    print(f"行数: {len(public_key_string.split(chr(10)))} 行")
    
    # 检查关键部分
    if '-----BEGIN CERTIFICATE-----' in public_key_string:
        begin_idx = public_key_string.find('-----BEGIN CERTIFICATE-----')
        end_idx = public_key_string.find('-----END CERTIFICATE-----')
        if end_idx > begin_idx:
            cert_body = public_key_string[begin_idx + len('-----BEGIN CERTIFICATE-----'):end_idx]
            print(f"\n证书主体长度: {len(cert_body)} 字符")
            print(f"证书主体前50字符: {cert_body[:50]}")
            print(f"证书主体后50字符: {cert_body[-50:]}")
        else:
            print("\n⚠️  警告: 未找到 END CERTIFICATE 标记")
    else:
        print("\n❌ 未找到 BEGIN CERTIFICATE 标记")
else:
    print("❌ 未找到 WECHAT_PUBLIC_KEY")

