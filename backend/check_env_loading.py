#!/usr/bin/env python
"""
检查环境变量加载
用于诊断环境变量是否正确加载到 Django 应用中
"""

import os
import sys
from pathlib import Path

# 添加项目路径
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# 设置 Django 环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.conf import settings

print("="*60)
print("环境变量检查")
print("="*60)

# 检查环境变量文件
env_files = [
    BASE_DIR / ".env",
    BASE_DIR / ".env.local",
    BASE_DIR / ".env.development",
    Path("/www/server/python_project/vhost/env/backend.env"),
]

print("\n检查环境变量文件:")
for env_file in env_files:
    if env_file.exists():
        print(f"✅ {env_file}")
        # 检查是否包含 WECHAT_PUBLIC_KEY_ID
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                content = f.read()
                if 'WECHAT_PUBLIC_KEY_ID' in content:
                    # 提取值
                    for line in content.split('\n'):
                        if line.strip().startswith('WECHAT_PUBLIC_KEY_ID'):
                            print(f"   找到: {line.strip()[:50]}...")
        except Exception as e:
            print(f"   ⚠️ 读取失败: {e}")
    else:
        print(f"❌ {env_file} (不存在)")

# 检查环境变量
print("\n检查环境变量值:")
wechat_public_key_id = os.getenv("WECHAT_PUBLIC_KEY_ID")
if wechat_public_key_id:
    print(f"✅ WECHAT_PUBLIC_KEY_ID = {wechat_public_key_id}")
else:
    print("❌ WECHAT_PUBLIC_KEY_ID 未设置")

# 检查 Django 设置
print("\n检查 Django 设置:")
print(f"BASE_DIR = {settings.BASE_DIR}")

# 尝试导入支付模块并检查
print("\n检查支付模块:")
try:
    from core.payment.wechat import get_wechatpay_client
    # 在导入时检查环境变量
    import os
    key_id = os.getenv("WECHAT_PUBLIC_KEY_ID")
    print(f"在支付模块中，WECHAT_PUBLIC_KEY_ID = {key_id if key_id else 'None'}")
except Exception as e:
    print(f"❌ 导入失败: {e}")

