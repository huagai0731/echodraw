# backend/fix_wechat_env.py
"""
检查并修复 .env 文件中的微信支付配置
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
print("检查并修复 .env 文件中的微信支付配置")
print("=" * 50)

# 读取 .env 文件
with open(env_file, 'r', encoding='utf-8') as f:
    content = f.read()

# 检查配置
issues = []
fixes = {}

# 检查商户私钥
private_key_match = re.search(r'WECHAT_PRIVATE_KEY\s*=\s*"([^"]*)"', content, re.DOTALL)
if private_key_match:
    private_key = private_key_match.group(1).strip()
    print(f"\n【商户私钥】")
    print(f"  当前长度: {len(private_key)} 字符")
    
    if len(private_key) < 500:
        issues.append("商户私钥内容不完整（少于500字符）")
        print(f"  ❌ 私钥内容不完整，需要完整内容")
        print(f"  💡 请从 apiclient_key.pem 文件中复制完整的私钥内容")
    else:
        print(f"  ✅ 私钥长度正常")
else:
    issues.append("未找到 WECHAT_PRIVATE_KEY 配置")

# 检查平台证书
public_key_match = re.search(r'WECHAT_PUBLIC_KEY\s*=\s*"([^"]*)"', content, re.DOTALL)
if public_key_match:
    public_key = public_key_match.group(1).strip()
    print(f"\n【平台证书】")
    print(f"  当前长度: {len(public_key)} 字符")
    
    if len(public_key) < 200:
        issues.append("平台证书内容不完整（少于200字符）")
        print(f"  ❌ 证书内容不完整，需要完整内容")
        print(f"  💡 请从微信支付商户平台重新下载平台证书")
    else:
        print(f"  ✅ 证书长度正常")
else:
    issues.append("未找到 WECHAT_PUBLIC_KEY 配置")

# 检查其他配置
required_vars = {
    'WECHAT_APPID': '微信AppID',
    'WECHAT_MCHID': '商户号',
    'WECHAT_CERT_SERIAL_NO': '证书序列号',
    'WECHAT_APIV3_KEY': 'APIv3密钥',
    'WECHAT_NOTIFY_URL': '回调地址',
}

print(f"\n【其他配置】")
for var, desc in required_vars.items():
    pattern = rf'{var}\s*=\s*([^\n]+)'
    match = re.search(pattern, content)
    if match:
        value = match.group(1).strip()
        if value:
            # 隐藏敏感信息
            if len(value) > 20:
                display_value = value[:10] + "..." + value[-5:]
            else:
                display_value = value
            print(f"  ✅ {var}: {display_value}")
        else:
            issues.append(f"{var} ({desc}) 未设置")
            print(f"  ❌ {var} ({desc}): 未设置")
    else:
        issues.append(f"{var} ({desc}) 未找到")
        print(f"  ❌ {var} ({desc}): 未找到")

# 总结
print("\n" + "=" * 50)
if issues:
    print("❌ 发现以下问题：")
    for i, issue in enumerate(issues, 1):
        print(f"  {i}. {issue}")
    
    print("\n💡 修复建议：")
    print("1. 商户私钥：")
    print("   - 打开 apiclient_key.pem 文件")
    print("   - 复制所有内容（包括 BEGIN/END 标记，或所有行的 base64 内容）")
    print("   - 在 .env 文件中更新 WECHAT_PRIVATE_KEY")
    print("\n2. 平台证书：")
    print("   - 登录微信支付商户平台：https://pay.weixin.qq.com/")
    print("   - 进入：账户中心 -> API安全 -> 平台证书")
    print("   - 下载或查看证书，复制完整内容")
    print("   - 在 .env 文件中更新 WECHAT_PUBLIC_KEY")
    print("\n3. 确保证书和私钥内容完整（不要只复制第一行）")
else:
    print("✅ 所有配置检查通过！")

print("=" * 50)

