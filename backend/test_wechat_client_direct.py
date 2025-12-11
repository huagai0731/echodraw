# backend/test_wechat_client_direct.py
"""
直接测试创建 WeChatPay 客户端
"""
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")

from wechatpayv3 import WeChatPay, WeChatPayType

print("=" * 60)
print("直接测试创建 WeChatPay 客户端")
print("=" * 60)

# 读取配置
mchid = os.getenv('WECHAT_MCHID')
cert_serial_no = os.getenv('WECHAT_CERT_SERIAL_NO')
appid = os.getenv('WECHAT_APPID')
apiv3_key = os.getenv('WECHAT_APIV3_KEY')
notify_url = os.getenv('WECHAT_NOTIFY_URL')

# 读取私钥
private_key_path = os.getenv('WECHAT_PRIVATE_KEY_PATH')
with open(private_key_path, 'r', encoding='utf-8') as f:
    private_key = f.read().strip()

# 读取公钥
public_key_path = os.getenv('WECHAT_PUBLIC_KEY_PATH')
with open(public_key_path, 'r', encoding='utf-8') as f:
    public_key = f.read().strip()

print(f"\n配置:")
print(f"  mchid: {mchid}")
print(f"  cert_serial_no: {cert_serial_no[:20]}...")
print(f"  appid: {appid}")
print(f"  apiv3_key: {apiv3_key[:20]}...")
print(f"  private_key 长度: {len(private_key)}")
print(f"  public_key 长度: {len(public_key)}")
print(f"  public_key 前50字符: {public_key[:50]}")

try:
    client = WeChatPay(
        wechatpay_type=WeChatPayType.NATIVE,
        mchid=mchid,
        private_key=private_key,
        cert_serial_no=cert_serial_no,
        appid=appid,
        apiv3_key=apiv3_key,
        notify_url=notify_url,
        public_key=public_key,
        public_key_id=None,  # 显式传递 None
    )
    print("\n✅ 微信支付客户端创建成功！")
except Exception as e:
    print(f"\n❌ 创建客户端失败: {e}")
    import traceback
    traceback.print_exc()

