# backend/debug_wechat_client.py
"""
调试微信支付客户端创建
"""
import os
import sys
import django
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

print("=" * 60)
print("调试微信支付客户端创建")
print("=" * 60)

try:
    from core.payment.wechat import get_wechatpay_client
    
    # 在创建客户端之前，检查环境变量
    print("\n环境变量检查：")
    print(f"  WECHAT_PUBLIC_KEY 存在: {bool(os.getenv('WECHAT_PUBLIC_KEY'))}")
    print(f"  WECHAT_PUBLIC_KEY_PATH: {os.getenv('WECHAT_PUBLIC_KEY_PATH')}")
    print(f"  WECHAT_CERT_DIR: {os.getenv('WECHAT_CERT_DIR')}")
    
    # 尝试创建客户端
    print("\n尝试创建客户端...")
    client = get_wechatpay_client()
    print("✅ 微信支付客户端创建成功！")
    
except Exception as e:
    print(f"\n❌ 创建客户端失败: {e}")
    import traceback
    traceback.print_exc()

