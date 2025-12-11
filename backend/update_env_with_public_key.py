# backend/update_env_with_public_key.py
"""
自动读取平台证书文件并更新 .env
"""
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
env_file = BASE_DIR / ".env"
public_key_file = BASE_DIR / "pub_key.pem"

print("=" * 60)
print("自动更新平台证书到 .env 文件")
print("=" * 60)

# 读取平台证书文件
if not public_key_file.exists():
    print(f"❌ 未找到平台证书文件: {public_key_file}")
    exit(1)

with open(public_key_file, 'r', encoding='utf-8') as f:
    public_key_content = f.read().strip()

print(f"✅ 读取平台证书文件: {len(public_key_content)} 字符")

# 读取 .env 文件
if not env_file.exists():
    print(f"❌ 未找到 .env 文件: {env_file}")
    exit(1)

with open(env_file, 'r', encoding='utf-8') as f:
    env_content = f.read()

# 查找并替换 WECHAT_PUBLIC_KEY
# 匹配模式：WECHAT_PUBLIC_KEY="..." 或 WECHAT_PUBLIC_KEY=...
pattern = r'(WECHAT_PUBLIC_KEY\s*=\s*)"[^"]*"'
replacement = rf'\1"{public_key_content}"'

if re.search(pattern, env_content):
    new_content = re.sub(pattern, replacement, env_content, flags=re.DOTALL)
    print("✅ 找到 WECHAT_PUBLIC_KEY，准备更新...")
else:
    # 如果没有找到，尝试添加
    pattern2 = r'(WECHAT_PUBLIC_KEY\s*=\s*)[^\n]*'
    if re.search(pattern2, env_content):
        new_content = re.sub(pattern2, rf'\1"{public_key_content}"', env_content)
        print("✅ 找到 WECHAT_PUBLIC_KEY（无引号），准备更新...")
    else:
        print("❌ 未找到 WECHAT_PUBLIC_KEY 配置")
        exit(1)

# 备份原文件
backup_file = BASE_DIR / ".env.backup2"
with open(backup_file, 'w', encoding='utf-8') as f:
    f.write(env_content)
print(f"✅ 已备份原文件到: {backup_file}")

# 写入新内容
with open(env_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ .env 文件已更新！")
print("\n现在可以运行测试：")
print("  python test_wechat_config.py")

