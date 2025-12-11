# backend/test_wechat_payment.py
"""
测试微信支付功能
"""
import os
import sys
import django
from pathlib import Path
from decimal import Decimal

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

print("=" * 60)
print("测试微信支付功能")
print("=" * 60)

try:
    from core.payment.wechat import get_wechatpay_client, create_wechatpay_qrcode
    
    # 测试1: 创建客户端
    print("\n【测试1】创建微信支付客户端...")
    client = get_wechatpay_client()
    print("✅ 客户端创建成功")
    
    # 测试2: 创建支付二维码
    print("\n【测试2】创建支付二维码...")
    order_number = f"TEST{int(__import__('time').time() * 1000)}"
    amount = "0.01"  # 测试金额：1分钱
    description = "测试订单"
    
    print(f"  订单号: {order_number}")
    print(f"  金额: {amount} 元")
    print(f"  描述: {description}")
    
    code_url = create_wechatpay_qrcode(
        order_number=order_number,
        amount=amount,
        description=description,
    )
    
    print(f"✅ 二维码创建成功！")
    print(f"  二维码URL: {code_url}")
    print(f"\n  你可以用微信扫描这个二维码进行支付测试")
    print(f"  或者访问: https://cli.im/api/qrcode/code?text={code_url}")
    
    # 测试3: 查询订单状态
    print("\n【测试3】查询订单状态...")
    from core.payment.wechat import query_wechatpay_order_status
    status = query_wechatpay_order_status(order_number)
    print(f"✅ 订单状态查询成功")
    print(f"  订单号: {order_number}")
    print(f"  状态: {status}")
    
    print("\n" + "=" * 60)
    print("✅ 所有测试通过！微信支付功能正常！")
    print("=" * 60)
    
except Exception as e:
    print(f"\n❌ 测试失败: {e}")
    import traceback
    traceback.print_exc()

