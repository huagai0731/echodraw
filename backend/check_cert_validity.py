# backend/check_cert_validity.py
"""
检查证书文件是否有效
"""
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.backends import default_backend

BASE_DIR = Path(__file__).resolve().parent
cert_dir = BASE_DIR / "wechatpay_certs"

print("=" * 60)
print("检查证书文件有效性")
print("=" * 60)

if not cert_dir.exists():
    print(f"❌ 证书目录不存在: {cert_dir}")
    exit(1)

for pem_file in cert_dir.glob("*.pem"):
    print(f"\n检查文件: {pem_file.name}")
    try:
        with open(pem_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        print(f"  文件大小: {len(content)} 字符")
        print(f"  前50字符: {content[:50]}")
        
        # 尝试解析为证书
        if '-----BEGIN CERTIFICATE-----' in content or '-----BEGIN PUBLIC KEY-----' in content:
            try:
                if 'CERTIFICATE' in content:
                    cert = x509.load_pem_x509_certificate(content.encode('utf-8'), default_backend())
                    print(f"  ✅ 是有效的 X.509 证书")
                    print(f"  序列号: {cert.serial_number}")
                    print(f"  有效期: {cert.not_valid_before} 到 {cert.not_valid_after}")
                elif 'PUBLIC KEY' in content:
                    print(f"  ✅ 是有效的 PUBLIC KEY")
                else:
                    print(f"  ⚠️  格式未知")
            except Exception as e:
                print(f"  ❌ 解析失败: {e}")
        else:
            print(f"  ⚠️  没有证书标记")
            
    except Exception as e:
        print(f"  ❌ 读取失败: {e}")

