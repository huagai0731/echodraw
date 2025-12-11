# backend/fix_cert_format.py
"""
修复微信支付平台证书格式
从 .env 文件中读取证书，转换为正确的格式
"""
import os
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

print("=" * 50)
print("修复微信支付平台证书格式")
print("=" * 50)

# 读取 .env 文件
env_file = BASE_DIR / ".env"
if not env_file.exists():
    print(f"❌ .env 文件不存在: {env_file}")
    exit(1)

with open(env_file, 'r', encoding='utf-8') as f:
    content = f.read()

# 查找 WECHAT_PUBLIC_KEY
pattern = r'WECHAT_PUBLIC_KEY\s*=\s*"([^"]*(?:-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----)[^"]*)"'
match = re.search(pattern, content, re.DOTALL)

if not match:
    print("❌ 未找到 WECHAT_PUBLIC_KEY 配置")
    exit(1)

cert_content = match.group(1)
print(f"\n找到证书内容，长度: {len(cert_content)} 字符")

# 检查证书是否完整
if '-----BEGIN CERTIFICATE-----' not in cert_content:
    print("❌ 证书格式错误：缺少 BEGIN CERTIFICATE")
    exit(1)

if '-----END CERTIFICATE-----' not in cert_content:
    print("⚠️  证书可能不完整：缺少 END CERTIFICATE")
    print("尝试修复...")
    # 尝试从内容中提取证书部分
    begin_idx = cert_content.find('-----BEGIN CERTIFICATE-----')
    if begin_idx >= 0:
        cert_content = cert_content[begin_idx:]
        if '-----END CERTIFICATE-----' not in cert_content:
            # 尝试添加结束标记
            cert_content = cert_content.rstrip() + '\n-----END CERTIFICATE-----'

# 尝试提取公钥
try:
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.backends import default_backend
    
    # 清理证书内容
    cert_lines = []
    in_cert = False
    for line in cert_content.split('\n'):
        if '-----BEGIN CERTIFICATE-----' in line:
            in_cert = True
            cert_lines.append('-----BEGIN CERTIFICATE-----')
        elif '-----END CERTIFICATE-----' in line:
            cert_lines.append('-----END CERTIFICATE-----')
            break
        elif in_cert:
            # 只保留有效的 base64 字符
            cleaned = re.sub(r'[^A-Za-z0-9+/=\s]', '', line)
            if cleaned.strip():
                cert_lines.append(cleaned)
    
    cert_pem = '\n'.join(cert_lines)
    
    print(f"\n清理后的证书长度: {len(cert_pem)} 字符")
    print(f"证书前50个字符: {cert_pem[:50]}")
    
    # 解析证书
    cert = x509.load_pem_x509_certificate(cert_pem.encode('utf-8'), default_backend())
    public_key_obj = cert.public_key()
    
    # 转换为 PUBLIC KEY 格式
    public_key_pem = public_key_obj.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')
    
    print("\n✅ 成功提取公钥！")
    print("\n转换后的 PUBLIC KEY:")
    print("-" * 50)
    print(public_key_pem)
    print("-" * 50)
    
    print("\n💡 请将上面的内容替换 .env 文件中的 WECHAT_PUBLIC_KEY")
    print("   格式应该是:")
    print('   WECHAT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----"')
    
except Exception as e:
    print(f"\n❌ 提取公钥失败: {e}")
    print("\n请检查:")
    print("1. 证书内容是否完整")
    print("2. 证书是否从微信支付商户平台正确下载")
    print("3. .env 文件中的证书格式是否正确（多行字符串需要用引号包裹）")
    import traceback
    traceback.print_exc()

