# backend/check_env_format.py
"""
检查 .env 文件格式
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
env_file = BASE_DIR / ".env"

print("=" * 50)
print("检查 .env 文件格式")
print("=" * 50)

if not env_file.exists():
    print(f"❌ .env 文件不存在: {env_file}")
    exit(1)

print(f"✅ 找到 .env 文件: {env_file}")

# 读取文件内容
with open(env_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"\n文件总行数: {len(lines)}")

# 检查微信支付相关配置
wechat_vars = [
    'WECHAT_APPID',
    'WECHAT_MCHID',
    'WECHAT_CERT_SERIAL_NO',
    'WECHAT_NOTIFY_URL',
    'WECHAT_PUBLIC_KEY_PATH',
    'WECHAT_PUBLIC_KEY',
    'WECHAT_PRIVATE_KEY_PATH',
    'WECHAT_PRIVATE_KEY',
]

print("\n【检查微信支付配置】")
for i, line in enumerate(lines, 1):
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    
    for var in wechat_vars:
        if line.startswith(f'{var}='):
            value = line[len(f'{var}='):].strip()
            # 检查是否有引号问题
            if value.startswith('="') or value.startswith("='"):
                print(f"  ⚠️  第 {i} 行: {var} 的值可能包含多余的引号")
                print(f"     当前值: {value[:50]}...")
            elif len(value) > 100:
                print(f"  ✅ 第 {i} 行: {var} 已设置（值较长，可能是证书内容）")
            else:
                print(f"  ✅ 第 {i} 行: {var} = {value}")

print("\n【.env 文件格式建议】")
print("""
正确的格式应该是：

# 方式1：使用文件路径
WECHAT_PUBLIC_KEY_PATH=/path/to/wechatpay_public_key.pem
WECHAT_PRIVATE_KEY_PATH=/path/to/apiclient_key.pem

# 方式2：使用证书内容（多行字符串）
WECHAT_PUBLIC_KEY="-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END CERTIFICATE-----"

WECHAT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAAOCBA8AMIIBCgKCAQEA...
-----END PRIVATE KEY-----"

注意：
1. 多行字符串需要用双引号包裹
2. 不要有多余的引号（如 ="..."）
3. 如果使用文件路径，确保文件存在
""")

