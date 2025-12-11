# backend/debug_load_public_key.py
"""
调试 load_public_key 函数
"""
from pathlib import Path
from wechatpayv3.utils import load_public_key

f = Path('pub_key.pem')
content = f.read_text().strip()

print("=" * 60)
print("调试 load_public_key")
print("=" * 60)

print(f"\n输入内容长度: {len(content)} 字符")
print(f"前100字符:\n{content[:100]}")

try:
    result = load_public_key(content)
    print(f"\n✅ load_public_key 成功")
    print(f"返回结果: {result}")
    print(f"结果类型: {type(result)}")
    print(f"结果是否为 None: {result is None}")
    if result:
        print(f"结果是否为真值: {bool(result)}")
except Exception as e:
    print(f"\n❌ load_public_key 失败: {e}")
    import traceback
    traceback.print_exc()

