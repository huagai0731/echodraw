# backend/setup_cert_dir.py
"""
设置证书目录，使用 cert_dir 方式
"""
import os
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# 创建证书目录
cert_dir = BASE_DIR / "wechatpay_certs"
cert_dir.mkdir(exist_ok=True)

# 复制证书文件
key_file = BASE_DIR / "apiclient_key.pem"
pub_file = BASE_DIR / "pub_key.pem"

if not key_file.exists():
    print(f"❌ 未找到私钥文件: {key_file}")
    exit(1)

if not pub_file.exists():
    print(f"❌ 未找到公钥文件: {pub_file}")
    exit(1)

# 复制文件到证书目录
shutil.copy(key_file, cert_dir / "apiclient_key.pem")
shutil.copy(pub_file, cert_dir / "wechatpay_cert.pem")

print(f"✅ 证书文件已复制到: {cert_dir}")
print(f"   - {cert_dir / 'apiclient_key.pem'}")
print(f"   - {cert_dir / 'wechatpay_cert.pem'}")

# 更新 .env 文件
env_file = BASE_DIR / ".env"
if env_file.exists():
    with open(env_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 添加或更新 WECHAT_CERT_DIR
    import re
    cert_dir_path = str(cert_dir.resolve()).replace('\\', '/')
    
    if re.search(r'WECHAT_CERT_DIR\s*=', content):
        content = re.sub(r'WECHAT_CERT_DIR\s*=[^\n]*', f'WECHAT_CERT_DIR={cert_dir_path}', content)
        print(f"✅ 已更新 WECHAT_CERT_DIR={cert_dir_path}")
    else:
        content += f"\nWECHAT_CERT_DIR={cert_dir_path}\n"
        print(f"✅ 已添加 WECHAT_CERT_DIR={cert_dir_path}")
    
    with open(env_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("\n✅ .env 文件已更新！")

print("\n现在可以运行测试：")
print("  python test_wechat_config.py")

