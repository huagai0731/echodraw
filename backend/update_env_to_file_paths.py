# backend/update_env_to_file_paths.py
"""
将 .env 文件中的证书配置改为使用文件路径
"""
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
env_file = BASE_DIR / ".env"

print("=" * 60)
print("更新 .env 文件使用文件路径")
print("=" * 60)

# 检查文件是否存在
key_file = BASE_DIR / "apiclient_key.pem"
pub_file = BASE_DIR / "pub_key.pem"

if not key_file.exists():
    print(f"❌ 未找到私钥文件: {key_file}")
    exit(1)

if not pub_file.exists():
    print(f"❌ 未找到公钥文件: {pub_file}")
    exit(1)

print(f"✅ 找到私钥文件: {key_file}")
print(f"✅ 找到公钥文件: {pub_file}")

# 读取 .env 文件
if not env_file.exists():
    print(f"❌ 未找到 .env 文件: {env_file}")
    exit(1)

with open(env_file, 'r', encoding='utf-8') as f:
    content = f.read()

# 获取绝对路径（Windows 格式）
key_path = str(key_file.resolve()).replace('\\', '/')
pub_path = str(pub_file.resolve()).replace('\\', '/')

print(f"\n私钥路径: {key_path}")
print(f"公钥路径: {pub_path}")

# 替换 WECHAT_PRIVATE_KEY 为文件路径
# 匹配 WECHAT_PRIVATE_KEY="..." 或 WECHAT_PRIVATE_KEY=...
pattern1 = r'(WECHAT_PRIVATE_KEY\s*=\s*)"[^"]*"'
replacement1 = rf'WECHAT_PRIVATE_KEY_PATH={key_path}'
if re.search(pattern1, content):
    content = re.sub(pattern1, replacement1, content, flags=re.DOTALL)
    print("✅ 已更新 WECHAT_PRIVATE_KEY -> WECHAT_PRIVATE_KEY_PATH")
else:
    # 尝试匹配无引号的
    pattern1b = r'(WECHAT_PRIVATE_KEY\s*=\s*)[^\n]*'
    if re.search(pattern1b, content):
        content = re.sub(pattern1b, rf'WECHAT_PRIVATE_KEY_PATH={key_path}', content)
        print("✅ 已更新 WECHAT_PRIVATE_KEY -> WECHAT_PRIVATE_KEY_PATH")
    else:
        # 如果没找到，添加新行
        content += f"\nWECHAT_PRIVATE_KEY_PATH={key_path}\n"
        print("✅ 已添加 WECHAT_PRIVATE_KEY_PATH")

# 替换 WECHAT_PUBLIC_KEY 为文件路径
pattern2 = r'(WECHAT_PUBLIC_KEY\s*=\s*)"[^"]*"'
replacement2 = rf'WECHAT_PUBLIC_KEY_PATH={pub_path}'
if re.search(pattern2, content):
    content = re.sub(pattern2, replacement2, content, flags=re.DOTALL)
    print("✅ 已更新 WECHAT_PUBLIC_KEY -> WECHAT_PUBLIC_KEY_PATH")
else:
    # 尝试匹配无引号的
    pattern2b = r'(WECHAT_PUBLIC_KEY\s*=\s*)[^\n]*'
    if re.search(pattern2b, content):
        content = re.sub(pattern2b, rf'WECHAT_PUBLIC_KEY_PATH={pub_path}', content)
        print("✅ 已更新 WECHAT_PUBLIC_KEY -> WECHAT_PUBLIC_KEY_PATH")
    else:
        # 如果没找到，添加新行
        content += f"\nWECHAT_PUBLIC_KEY_PATH={pub_path}\n"
        print("✅ 已添加 WECHAT_PUBLIC_KEY_PATH")

# 备份原文件
backup_file = BASE_DIR / ".env.backup3"
with open(backup_file, 'w', encoding='utf-8') as f:
    with open(env_file, 'r', encoding='utf-8') as orig:
        f.write(orig.read())
print(f"✅ 已备份原文件到: {backup_file}")

# 写入新内容
with open(env_file, 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✅ .env 文件已更新为使用文件路径！")
print("\n现在可以运行测试：")
print("  python test_wechat_config.py")

