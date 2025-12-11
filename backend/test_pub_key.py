# backend/test_pub_key.py
"""
测试公钥加载
"""
from pathlib import Path
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.hazmat.backends import default_backend

f = Path('pub_key.pem')
content = f.read_text()

print("=" * 60)
print("测试公钥加载")
print("=" * 60)

print(f"\n文件内容长度: {len(content)} 字符")
print(f"前100字符:\n{content[:100]}")

try:
    key = load_pem_public_key(content.encode('utf-8'), default_backend())
    print("\n✅ 公钥加载成功！")
    print(f"密钥类型: {type(key)}")
except Exception as e:
    print(f"\n❌ 公钥加载失败: {e}")
    import traceback
    traceback.print_exc()

