# backend/check_private_key.py
"""
检查商户私钥内容
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

private_key_string = os.getenv('WECHAT_PRIVATE_KEY')

if private_key_string:
    print("=" * 50)
    print("商户私钥内容:")
    print("=" * 50)
    print(private_key_string)
    print("=" * 50)
    print(f"\n长度: {len(private_key_string)} 字符")
    print(f"行数: {len(private_key_string.split(chr(10)))} 行")
    
    # 检查是否包含 BEGIN/END
    has_begin = '-----BEGIN' in private_key_string
    has_end = '-----END' in private_key_string
    
    print(f"\n包含 BEGIN 标记: {has_begin}")
    print(f"包含 END 标记: {has_end}")
    
    if not has_begin and not has_end:
        print("\n⚠️  私钥没有 BEGIN/END 标记，只有 base64 内容")
        print("   尝试添加标记后测试...")
        
        # 尝试添加标记
        private_key_with_markers = f"-----BEGIN PRIVATE KEY-----\n{private_key_string}\n-----END PRIVATE KEY-----"
        print(f"\n添加标记后的长度: {len(private_key_with_markers)} 字符")
        
        # 尝试解析
        try:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.backends import default_backend
            
            # 尝试不同的私钥格式
            for key_type in ['PRIVATE KEY', 'RSA PRIVATE KEY']:
                try:
                    test_key = f"-----BEGIN {key_type}-----\n{private_key_string}\n-----END {key_type}-----"
                    key = serialization.load_pem_private_key(
                        test_key.encode('utf-8'),
                        password=None,
                        backend=default_backend()
                    )
                    print(f"\n✅ 成功！使用 {key_type} 格式可以解析")
                    break
                except Exception as e:
                    print(f"  ❌ {key_type} 格式失败: {str(e)[:100]}")
        except Exception as e:
            print(f"\n❌ 解析失败: {e}")
else:
    print("❌ 未找到 WECHAT_PRIVATE_KEY")

