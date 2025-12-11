# backend/test_wechat_config.py
"""
测试微信支付配置
"""
import os
import sys
import django
from pathlib import Path

# 设置Django环境
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

def test_wechat_config():
    """测试微信支付配置"""
    print("=" * 50)
    print("微信支付配置测试")
    print("=" * 50)
    
    # 检查环境变量
    print("\n【检查环境变量】")
    required_vars = [
        'WECHAT_APPID',
        'WECHAT_MCHID',
        'WECHAT_CERT_SERIAL_NO',
        'WECHAT_APIV3_KEY',
        'WECHAT_NOTIFY_URL',
    ]
    
    missing_vars = []
    for var in required_vars:
        value = os.getenv(var)
        if value:
            # 隐藏敏感信息的部分内容
            if var in ['WECHAT_APPID', 'WECHAT_MCHID']:
                print(f"  ✅ {var}: {value}")
            else:
                print(f"  ✅ {var}: 已设置")
        else:
            print(f"  ❌ {var}: 未设置")
            missing_vars.append(var)
    
    if missing_vars:
        print(f"\n❌ 缺少必需的环境变量: {', '.join(missing_vars)}")
        return False
    
    # 检查证书文件
    print("\n【检查证书文件】")
    public_key_path = os.getenv('WECHAT_PUBLIC_KEY_PATH')
    public_key_string = os.getenv('WECHAT_PUBLIC_KEY')
    private_key_path = os.getenv('WECHAT_PRIVATE_KEY_PATH')
    private_key_string = os.getenv('WECHAT_PRIVATE_KEY')
    
    if public_key_path:
        # 检查是否是证书内容而不是文件路径
        if public_key_path.startswith('-----BEGIN') or public_key_path.startswith('MII') or public_key_path.startswith('="-----BEGIN'):
            print("  ⚠️  WECHAT_PUBLIC_KEY_PATH 看起来是证书内容而不是文件路径")
            print("  💡 建议：将证书内容放到 WECHAT_PUBLIC_KEY 环境变量中，或保存为文件后使用 WECHAT_PUBLIC_KEY_PATH")
            # 如果同时设置了 WECHAT_PUBLIC_KEY，使用它
            if public_key_string:
                print("  ✅ 检测到 WECHAT_PUBLIC_KEY，将使用它")
            else:
                print("  ⚠️  请确保 WECHAT_PUBLIC_KEY 环境变量已正确设置")
        elif os.path.exists(public_key_path):
            print(f"  ✅ 平台公钥文件存在: {public_key_path}")
        else:
            print(f"  ❌ 平台公钥文件不存在: {public_key_path}")
            return False
    elif public_key_string:
        # 支持有或没有 BEGIN/END 标记的格式
        if (public_key_string.strip().startswith('-----BEGIN') or 
            public_key_string.strip().startswith('MII') or
            'MII' in public_key_string):
            print("  ✅ 平台公钥字符串格式正确")
        else:
            print("  ❌ 平台公钥字符串格式错误")
            return False
    else:
        print("  ❌ WECHAT_PUBLIC_KEY_PATH 或 WECHAT_PUBLIC_KEY 未设置")
        return False
    
    if private_key_path:
        if os.path.exists(private_key_path):
            print(f"  ✅ 商户私钥文件存在: {private_key_path}")
        else:
            print(f"  ❌ 商户私钥文件不存在: {private_key_path}")
            return False
    elif private_key_string:
        # 支持有或没有 BEGIN/END 标记的格式
        if (private_key_string.strip().startswith('-----BEGIN') or
            'MII' in private_key_string or
            'PRIVATE KEY' in private_key_string.upper()):
            print("  ✅ 商户私钥字符串格式正确")
        else:
            print("  ❌ 商户私钥字符串格式错误")
            return False
    else:
        print("  ❌ WECHAT_PRIVATE_KEY_PATH 或 WECHAT_PRIVATE_KEY 未设置")
        return False
    
    # 测试创建微信支付客户端
    print("\n【测试创建微信支付客户端】")
    try:
        from core.payment.wechat import get_wechatpay_client
        client = get_wechatpay_client()
        print("  ✅ 微信支付客户端创建成功")
    except ValueError as e:
        print(f"  ❌ 配置错误: {e}")
        return False
    except Exception as e:
        print(f"  ❌ 创建客户端失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n" + "=" * 50)
    print("✅ 所有配置检查通过！微信支付配置正确！")
    print("=" * 50)
    return True

if __name__ == '__main__':
    success = test_wechat_config()
    sys.exit(0 if success else 1)

