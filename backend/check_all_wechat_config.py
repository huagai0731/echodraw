# backend/check_all_wechat_config.py
"""
检查 .env 文件中所有微信支付相关配置
"""
import os
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
env_file = BASE_DIR / ".env"

if not env_file.exists():
    print(f"❌ .env 文件不存在: {env_file}")
    exit(1)

print("=" * 50)
print("检查 .env 文件中所有微信支付相关配置")
print("=" * 50)

# 读取 .env 文件
with open(env_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 查找所有微信支付相关配置
wechat_configs = {}
for i, line in enumerate(lines, 1):
    line = line.strip()
    if line.startswith('WECHAT_'):
        # 提取配置名和值
        if '=' in line:
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip()
            # 移除引号
            if value.startswith('"') and value.endswith('"'):
                value = value[1:-1]
            elif value.startswith("'") and value.endswith("'"):
                value = value[1:-1]
            
            wechat_configs[key] = {
                'value': value,
                'line': i,
                'length': len(value)
            }

print("\n找到的微信支付配置：")
for key, info in sorted(wechat_configs.items()):
    value = info['value']
    length = info['length']
    
    # 显示值（隐藏敏感信息）
    if length > 30:
        display_value = value[:15] + "..." + value[-10:]
    else:
        display_value = value
    
    print(f"\n  {key} (第 {info['line']} 行):")
    print(f"    长度: {length} 字符")
    print(f"    值: {display_value}")
    
    # 检查是否完整
    if key in ['WECHAT_PRIVATE_KEY', 'WECHAT_PUBLIC_KEY']:
        if length < 200:
            print(f"    ⚠️  内容可能不完整（通常需要 200+ 字符）")
        elif length < 500 and key == 'WECHAT_PRIVATE_KEY':
            print(f"    ⚠️  私钥可能不完整（通常需要 1000+ 字符）")

print("\n" + "=" * 50)
print("配置检查完成")
print("=" * 50)

