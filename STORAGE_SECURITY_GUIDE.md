# 文件存储安全配置指南

## 当前状态

当前文件存储在本地服务器：`backend/media/uploads/`

### 安全风险

1. **文件执行风险**：如果Web服务器配置不当，可能直接执行上传的文件（如.php、.js文件）
2. **路径暴露**：文件路径可能暴露服务器目录结构
3. **存储空间**：本地存储受服务器磁盘空间限制

## 推荐方案：迁移到对象存储

### 方案1：使用阿里云OSS / 腾讯云COS / AWS S3

#### 优势
- ✅ 文件存储在独立服务，无法直接执行
- ✅ 自动CDN加速
- ✅ 无限扩展存储空间
- ✅ 更好的安全隔离

#### 实施步骤

1. **安装依赖**
   ```bash
   pip install django-storages boto3
   ```

2. **配置settings.py**
   ```python
   # 使用对象存储
   USE_TOS_STORAGE = os.getenv("USE_TOS_STORAGE", "false").lower() == "true"
   
   if USE_TOS_STORAGE:
       # 阿里云OSS配置示例
       DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
       AWS_ACCESS_KEY_ID = os.getenv("OSS_ACCESS_KEY_ID")
       AWS_SECRET_ACCESS_KEY = os.getenv("OSS_SECRET_ACCESS_KEY")
       AWS_STORAGE_BUCKET_NAME = os.getenv("OSS_BUCKET_NAME")
       AWS_S3_ENDPOINT_URL = os.getenv("OSS_ENDPOINT_URL")  # 例如：https://oss-cn-shanghai.aliyuncs.com
       AWS_S3_CUSTOM_DOMAIN = os.getenv("OSS_CUSTOM_DOMAIN")  # CDN域名（可选）
       AWS_S3_OBJECT_PARAMETERS = {
           'CacheControl': 'max-age=86400',
       }
       AWS_DEFAULT_ACL = 'public-read'  # 或 'private' 如果需要私有访问
   else:
       # 本地存储（当前方案）
       MEDIA_ROOT = BASE_DIR / "media"
       MEDIA_URL = "/media/"
   ```

3. **配置CORS**（如果使用CDN域名）
   - 在对象存储控制台配置CORS规则
   - 允许的源：你的前端域名
   - 允许的方法：GET, HEAD
   - 允许的头部：*

4. **环境变量示例**
   ```bash
   USE_TOS_STORAGE=true
   OSS_ACCESS_KEY_ID=your_access_key
   OSS_SECRET_ACCESS_KEY=your_secret_key
   OSS_BUCKET_NAME=your_bucket_name
   OSS_ENDPOINT_URL=https://oss-cn-shanghai.aliyuncs.com
   OSS_CUSTOM_DOMAIN=https://cdn.yourdomain.com  # 可选
   ```

### 方案2：如果必须使用本地存储

如果暂时无法迁移到对象存储，请确保以下安全配置：

#### 1. Nginx配置（推荐）

```nginx
# 禁止直接访问media目录中的可执行文件
location ~* ^/media/uploads/.*\.(php|js|py|sh|exe|bat|cmd)$ {
    deny all;
    return 403;
}

# 只允许图片文件
location ~* ^/media/uploads/.*\.(jpg|jpeg|png|gif|webp)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}

# 通过Django代理访问（更安全）
location /media/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

#### 2. Django配置

确保文件通过Django视图访问，而不是直接暴露：

```python
# settings.py
# 不要直接暴露MEDIA_URL，使用代理视图
MEDIA_ROOT = BASE_DIR / "media"
# MEDIA_URL = "/media/"  # 注释掉，不使用直接访问

# 所有文件访问都通过 UserUploadImageView 视图
# 已经在 views.py:729 中实现
```

#### 3. 文件权限设置

```bash
# 设置media目录权限
chmod 755 backend/media
chmod 755 backend/media/uploads
# 文件只读
find backend/media/uploads -type f -exec chmod 644 {} \;
```

#### 4. 文件验证加强

已实现：
- ✅ MIME类型验证（serializers.py:104-133）
- ✅ 文件大小限制（10MB）
- ✅ PIL图片处理验证

## 当前代码中的安全措施

### 已实现

1. **文件路径随机化**
   - 位置：`backend/core/models.py:13-23`
   - 使用UUID作为文件名，避免可预测路径

2. **图片处理验证**
   - 位置：`backend/core/serializers.py:158-189`
   - 使用PIL处理，失败时拒绝上传

3. **MIME类型验证**
   - 位置：`backend/core/serializers.py:104-133`
   - 只允许图片类型

4. **权限检查**
   - 位置：`backend/core/views.py:773`
   - 用户只能访问自己的文件

### 建议改进

1. **迁移到对象存储**（优先级：高）
   - 完全隔离文件执行风险
   - 更好的扩展性

2. **如果使用本地存储**
   - 配置Nginx禁止执行文件
   - 所有访问通过Django视图
   - 设置正确的文件权限

## 迁移检查清单

- [ ] 选择对象存储服务（OSS/COS/S3）
- [ ] 创建存储桶并配置CORS
- [ ] 安装django-storages
- [ ] 配置环境变量
- [ ] 更新settings.py
- [ ] 测试文件上传
- [ ] 测试文件访问
- [ ] 迁移现有文件（如需要）
- [ ] 更新文档

## 参考资源

- [django-storages文档](https://django-storages.readthedocs.io/)
- [阿里云OSS Python SDK](https://help.aliyun.com/document_detail/32026.html)
- [AWS S3 Boto3文档](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)

