# backend/quick_fix_env.py
"""
快速修复 .env 文件 - 直接显示需要修复的内容
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
env_file = BASE_DIR / ".env"

print("=" * 60)
print("问题诊断")
print("=" * 60)

# 检查证书文件是否存在
cert_files = {
    'apiclient_key.pem': '商户私钥',
    'apiclient_cert.pem': '商户证书',
}

found_files = {}
for filename, desc in cert_files.items():
    file_path = BASE_DIR / filename
    if file_path.exists():
        found_files[filename] = file_path
        print(f"✅ 找到 {desc} 文件: {filename}")
    else:
        # 检查父目录
        parent_file = BASE_DIR.parent / filename
        if parent_file.exists():
            found_files[filename] = parent_file
            print(f"✅ 找到 {desc} 文件: {parent_file}")
        else:
            print(f"❌ 未找到 {desc} 文件: {filename}")

print("\n" + "=" * 60)
print("解决方案")
print("=" * 60)

if 'apiclient_key.pem' in found_files:
    print("\n【商户私钥】")
    print("文件位置:", found_files['apiclient_key.pem'])
    print("\n请执行以下操作：")
    print("1. 打开文件:", found_files['apiclient_key.pem'])
    print("2. 复制所有内容（包括所有行）")
    print("3. 在 .env 文件的第 78 行，替换 WECHAT_PRIVATE_KEY 的值")
    print("\n或者，直接运行以下命令查看文件内容：")
    print(f'   type "{found_files["apiclient_key.pem"]}"')
else:
    print("\n【商户私钥】")
    print("❌ 未找到 apiclient_key.pem 文件")
    print("请从微信支付商户平台下载 API 证书")

print("\n" + "=" * 60)
print("最简单的修复方法")
print("=" * 60)
print("\n在 .env 文件中，找到第 78 行的 WECHAT_PRIVATE_KEY")
print("将它的值改为完整的私钥内容（从 apiclient_key.pem 文件复制）")
print("\n格式应该是：")
print('WECHAT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----')
print('MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDL+P72omaBayR0')
print('...（所有行的内容）...')
print('-----END PRIVATE KEY-----"')
print("\n或者如果没有 BEGIN/END 标记，直接复制所有行的 base64 内容")

