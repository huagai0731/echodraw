# backend/extract_public_key.py
"""
从证书中提取公钥（使用 OpenSSL 命令）
"""
import os
import subprocess
import tempfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

print("=" * 50)
print("从证书提取公钥")
print("=" * 50)

public_key_string = os.getenv('WECHAT_PUBLIC_KEY')

if not public_key_string:
    print("❌ 未找到 WECHAT_PUBLIC_KEY")
    exit(1)

# 创建临时证书文件
with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as cert_file:
    cert_file.write(public_key_string)
    cert_file_path = cert_file.name

try:
    # 使用 OpenSSL 提取公钥
    print("\n尝试使用 OpenSSL 提取公钥...")
    result = subprocess.run(
        ['openssl', 'x509', '-in', cert_file_path, '-pubkey', '-noout'],
        capture_output=True,
        text=True,
        check=True
    )
    
    public_key = result.stdout
    print("\n✅ 成功提取公钥！")
    print("\n提取的公钥:")
    print("-" * 50)
    print(public_key)
    print("-" * 50)
    
    print("\n💡 请将上面的内容替换 .env 文件中的 WECHAT_PUBLIC_KEY")
    print("   注意：需要保持多行格式，用引号包裹")
    
except subprocess.CalledProcessError as e:
    print(f"❌ OpenSSL 命令失败: {e}")
    print(f"错误输出: {e.stderr}")
    print("\n尝试使用 Python cryptography 库...")
    
    # 备用方案：使用 Python 库
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.backends import default_backend
        
        with open(cert_file_path, 'rb') as f:
            cert = x509.load_pem_x509_certificate(f.read(), default_backend())
        
        public_key_obj = cert.public_key()
        public_key = public_key_obj.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode('utf-8')
        
        print("\n✅ 使用 Python 库成功提取公钥！")
        print("\n提取的公钥:")
        print("-" * 50)
        print(public_key)
        print("-" * 50)
        
    except Exception as e2:
        print(f"❌ Python 库也失败: {e2}")
        print("\n建议:")
        print("1. 重新从微信支付商户平台下载平台证书")
        print("2. 或者使用 WECHAT_PUBLIC_KEY_PATH 指向证书文件")
        print("3. 或者使用 cert_dir 方式（将证书放在目录中）")
        
finally:
    # 清理临时文件
    if os.path.exists(cert_file_path):
        os.unlink(cert_file_path)

