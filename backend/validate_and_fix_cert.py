# backend/validate_and_fix_cert.py
"""
验证并修复平台证书
"""
import os
import base64
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

print("=" * 60)
print("验证平台证书")
print("=" * 60)

public_key = os.getenv('WECHAT_PUBLIC_KEY', '').strip()

if not public_key:
    print("❌ 未找到 WECHAT_PUBLIC_KEY")
    exit(1)

print(f"\n证书长度: {len(public_key)} 字符")

# 移除可能的标记
cert_body = public_key.replace('-----BEGIN CERTIFICATE-----', '').replace('-----END CERTIFICATE-----', '').replace('\n', '').replace(' ', '')

print(f"证书主体长度: {len(cert_body)} 字符")

# 尝试 base64 解码
try:
    decoded = base64.b64decode(cert_body)
    print(f"✅ Base64 解码成功，解码后长度: {len(decoded)} 字节")
    
    # 一个完整的 X.509 证书通常需要 500+ 字节
    if len(decoded) < 300:
        print(f"\n⚠️  警告: 证书内容可能不完整（只有 {len(decoded)} 字节，完整证书通常需要 500+ 字节）")
        print("\n建议:")
        print("1. 从微信支付商户平台重新下载平台证书")
        print("2. 确保证书内容完整（包含所有行）")
    else:
        print(f"✅ 证书长度正常")
        
except Exception as e:
    print(f"❌ Base64 解码失败: {e}")
    print("\n证书内容可能格式不正确")

print("\n" + "=" * 60)
print("解决方案")
print("=" * 60)
print("\n如果证书不完整，请：")
print("1. 登录微信支付商户平台：https://pay.weixin.qq.com/")
print("2. 进入：账户中心 -> API安全 -> 平台证书")
print("3. 点击'查看证书'或'下载证书'")
print("4. 复制完整的证书内容（所有行）")
print("5. 更新 .env 文件中的 WECHAT_PUBLIC_KEY")

