# backend/generate_apiv3_key.py
"""
生成微信支付 APIv3 密钥
APIv3 密钥必须是 32 位的随机字符串
"""
import secrets
import string

def generate_apiv3_key(length=32):
    """
    生成微信支付 APIv3 密钥
    
    Args:
        length: 密钥长度，默认32位
    
    Returns:
        str: 生成的密钥
    """
    # 使用大小写字母和数字生成随机字符串
    alphabet = string.ascii_letters + string.digits
    key = ''.join(secrets.choice(alphabet) for _ in range(length))
    return key

if __name__ == '__main__':
    print("=" * 50)
    print("微信支付 APIv3 密钥生成器")
    print("=" * 50)
    print()
    
    # 生成密钥
    apiv3_key = generate_apiv3_key(32)
    
    print(f"生成的 APIv3 密钥（32位）:")
    print(f"  {apiv3_key}")
    print()
    print("=" * 50)
    print("使用说明：")
    print("=" * 50)
    print("1. 复制上面的密钥")
    print("2. 登录微信支付商户平台：https://pay.weixin.qq.com/")
    print("3. 进入：账户中心 -> API安全 -> API密钥")
    print("4. 设置 APIv3 密钥（粘贴上面生成的密钥）")
    print("5. 在 .env 文件中添加：")
    print(f"   WECHAT_APIV3_KEY={apiv3_key}")
    print()
    print("⚠️  注意：")
    print("   - 密钥生成后请妥善保管")
    print("   - 不要将密钥提交到代码仓库")
    print("   - 设置密钥后，微信支付会使用此密钥进行签名验证")
    print("=" * 50)

