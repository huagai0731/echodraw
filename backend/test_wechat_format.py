# backend/test_wechat_format.py
"""
测试 wechatpayv3 库的 format_public_key 函数
"""
from pathlib import Path
from wechatpayv3.utils import format_public_key, load_public_key

f = Path('pub_key.pem')
content = f.read_text().strip()

print("=" * 60)
print("测试 wechatpayv3 库的公钥处理")
print("=" * 60)

print(f"\n原始内容长度: {len(content)} 字符")
print(f"前100字符:\n{content[:100]}")

try:
    formatted = format_public_key(content)
    print(f"\n格式化后长度: {len(formatted)} 字符")
    print(f"格式化后前100字符:\n{formatted[:100]}")
    
    key = load_public_key(content)
    print("\n✅ 公钥加载成功！")
except Exception as e:
    print(f"\n❌ 公钥加载失败: {e}")
    import traceback
    traceback.print_exc()

