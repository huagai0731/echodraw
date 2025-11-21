#!/usr/bin/env python
"""
测试TOS上传功能
用于验证TOS配置是否正确
"""
import os
import sys
from pathlib import Path

# 添加项目路径
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# 设置Django环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.conf import settings
from config.storage import TOSMediaStorage

def test_tos_upload():
    """测试上传一个文本文件到TOS"""
    print("=" * 60)
    print("TOS配置检查")
    print("=" * 60)
    
    # 检查配置
    print(f"\nUSE_TOS_STORAGE: {getattr(settings, 'USE_TOS_STORAGE', False)}")
    print(f"DEFAULT_FILE_STORAGE: {getattr(settings, 'DEFAULT_FILE_STORAGE', 'Not set')}")
    print(f"TOS_BUCKET: {getattr(settings, 'TOS_BUCKET', 'Not set')}")
    print(f"TOS_ENDPOINT_URL: {getattr(settings, 'TOS_ENDPOINT_URL', 'Not set')}")
    print(f"TOS_ACCESS_KEY_ID: {'SET' if getattr(settings, 'TOS_ACCESS_KEY_ID', None) else 'NOT SET'}")
    print(f"TOS_SECRET_ACCESS_KEY: {'SET' if getattr(settings, 'TOS_SECRET_ACCESS_KEY', None) else 'NOT SET'}")
    
    if not getattr(settings, 'USE_TOS_STORAGE', False):
        print("\n❌ TOS存储未启用！")
        return False
    
    # 测试上传
    print("\n" + "=" * 60)
    print("测试上传文件到TOS")
    print("=" * 60)
    
    try:
        storage = TOSMediaStorage()
        test_content = f"Test file uploaded at {django.utils.timezone.now().isoformat()}\n"
        test_filename = "test_upload.txt"
        
        print(f"\n上传文件: {test_filename}")
        print(f"内容: {test_content.strip()}")
        
        # 保存文件
        from django.core.files.base import ContentFile
        storage.save(test_filename, ContentFile(test_content.encode('utf-8')))
        
        # 检查文件是否存在
        if storage.exists(test_filename):
            url = storage.url(test_filename)
            print(f"\n✅ 上传成功！")
            print(f"文件URL: {url}")
            print(f"Bucket: {storage.bucket_name}")
            return True
        else:
            print(f"\n❌ 文件上传后不存在！")
            return False
            
    except Exception as e:
        print(f"\n❌ 上传失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_tos_upload()
    sys.exit(0 if success else 1)

