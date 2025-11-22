# 代码风险自检报告

基于"个人独立开发者上线真实用户后最常遇到的坑"的三类风险进行自检。

## 🧨 一、并发/队列导致的"偶发性 bug"

### ✅ 已做好的地方

1. **事务使用**：
   - ✅ 注册 (`register`) 使用了 `transaction.atomic()` (views.py:371)
   - ✅ 重置密码 (`reset_password`) 使用了 `transaction.atomic()` (views.py:461)
   - ✅ 测试账号创建使用了 `transaction.atomic()` (serializers.py:1021)

2. **异步处理**：
   - ✅ 邮件发送使用了异步 (`send_mail_async`) (views.py:288)

### ❌ 发现的风险

#### 1. 文件上传没有事务保护 ⚠️ **高风险**

**位置**：`backend/core/views.py:678-700` (`UserUploadListCreateView.perform_create`)

**问题**：
```python
def perform_create(self, serializer: UserUploadSerializer):
    upload = serializer.save(user=self.request.user)
    # ... 创建打卡记录 ...
    checkin, created = DailyCheckIn.objects.get_or_create(...)
```

**风险**：
- 如果文件上传成功但创建打卡记录失败，会导致数据不一致
- 并发上传时可能出现竞态条件
- 如果图片压缩失败，可能导致部分数据已写入但文件未保存

**建议修复**：
```python
@transaction.atomic
def perform_create(self, serializer: UserUploadSerializer):
    upload = serializer.save(user=self.request.user)
    # ... 创建打卡记录 ...
```

#### 2. 打卡操作没有事务保护 ⚠️ **中风险**

**位置**：`backend/core/views.py:1139-1144` (`check_in`)

**问题**：
```python
checkin, created = DailyCheckIn.objects.get_or_create(
    user=user, date=target_date, defaults={"source": source}
)
```

**风险**：
- 虽然 `get_or_create` 本身是原子的，但后续的 `save()` 操作不在事务中
- 如果同时有多个请求，可能出现重复创建（虽然有唯一约束，但会报错）

**建议修复**：
```python
with transaction.atomic():
    checkin, created = DailyCheckIn.objects.get_or_create(...)
    if not created and source and not checkin.source:
        checkin.source = source
        checkin.save(update_fields=["source"])
```

#### 3. 文件路径没有用户隔离 ⚠️ **高风险**

**位置**：`backend/core/models.py:148` (`UserUpload.image`)

**问题**：
```python
image = models.ImageField(
    upload_to="uploads/%Y/%m/",  # ❌ 没有用户ID
    ...
)
```

**风险**：
- 如果两个用户在同一个月上传同名文件，可能互相覆盖
- 虽然Django会自动处理文件名冲突，但路径结构不安全

**建议修复**：
```python
def user_upload_path(instance, filename):
    """生成包含用户ID hash的文件路径"""
    import hashlib
    user_hash = hashlib.md5(str(instance.user.id).encode()).hexdigest()[:8]
    # 使用UUID作为文件名，避免冲突
    import uuid
    file_ext = filename.split('.')[-1] if '.' in filename else 'webp'
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    return f"uploads/{user_hash}/{unique_filename}"

image = models.ImageField(
    upload_to=user_upload_path,
    ...
)
```

#### 4. 没有使用UUID作为文件名 ⚠️ **中风险**

**位置**：`backend/core/serializers.py:142` (`UserUploadSerializer._compress_image`)

**问题**：
- 压缩后的文件名基于原始文件名，可能重复

**建议修复**：
- 在 `user_upload_path` 中已经使用UUID，确保文件名唯一

---

## 🧨 二、数据被覆盖/丢失

### ✅ 已做好的地方

1. **Migration系统**：
   - ✅ 使用了Django migration系统（有migrations目录）
   - ✅ Migration中的update操作都是针对特定记录的，不是全表更新

### ❌ 发现的风险

#### 1. 文件路径没有用户ID hash ⚠️ **高风险**

**位置**：`backend/core/models.py:148, 1297`

**问题**：
- `UserUpload.image`: `upload_to="uploads/%Y/%m/"`
- `DailyQuizOption.image`: `upload_to="daily_quiz/%Y/%m/"`

**风险**：
- 用户A的文件可能被用户B覆盖（如果文件名相同）
- 无法通过路径快速定位某个用户的文件

**建议修复**：
- 见上面"一、3"的修复方案

#### 2. Migration中有update操作 ⚠️ **低风险**

**位置**：
- `backend/core/migrations/0016_populate_achievement_groups.py:49`
- `backend/core/migrations/0022_enforce_unique_email.py:26, 35, 60`

**问题**：
```python
# 0016_populate_achievement_groups.py
Achievement.objects.update(group=None, level=1)  # 在reverse_code中

# 0022_enforce_unique_email.py
User.objects.filter(pk=user.pk).update(email=normalized)
```

**风险**：
- 如果migration重复执行，可能会覆盖数据
- 但这些都是有条件的update，不是全表更新

**建议**：
- ✅ 这些migration已经执行过，不会重复执行
- ⚠️ 如果未来需要类似的migration，确保有幂等性检查

#### 3. 没有看到"update all"操作 ✅

- ✅ 代码中没有发现危险的 `Model.objects.all().update(...)` 操作

---

## 🧨 三、阶段性崩溃（内存泄漏）

### ✅ 已做好的地方

1. **图片压缩**：
   - ✅ 上传时自动压缩图片，限制最大边长2048px (serializers.py:118-156)
   - ✅ 使用WEBP格式，减少文件大小

2. **对象存储**：
   - ✅ 配置了TOS存储（对象存储），可以减轻服务器压力

3. **资源管理**：
   - ✅ 图片处理使用了BytesIO，应该会自动释放

### ❌ 发现的风险

#### 1. 没有文件大小限制 ⚠️ **高风险**

**位置**：`backend/config/settings.py`

**问题**：
- 没有配置 `DATA_UPLOAD_MAX_MEMORY_SIZE`
- 没有配置 `FILE_UPLOAD_MAX_MEMORY_SIZE`
- 没有在serializer中验证文件大小

**风险**：
- 用户可能上传超大文件（如100MB的原始图片）
- 即使压缩后很小，上传时也会占用大量内存
- 可能导致服务器内存溢出，服务崩溃

**建议修复**：
```python
# settings.py
# 限制文件上传大小（10MB）
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10MB

# 在serializer中添加验证
def validate_image(self, value):
    # 限制文件大小为10MB
    max_size = 10 * 1024 * 1024  # 10MB
    if value.size > max_size:
        raise serializers.ValidationError(
            f"文件大小不能超过 {max_size / 1024 / 1024}MB"
        )
    return value
```

#### 2. 图片压缩在内存中进行 ⚠️ **中风险**

**位置**：`backend/core/serializers.py:118-156`

**问题**：
- 图片压缩使用PIL，在内存中处理
- 如果原图很大（如50MB），即使压缩后很小，处理时也会占用大量内存

**风险**：
- 多个用户同时上传大图时，可能导致内存溢出

**建议**：
- ✅ 已经有文件大小限制（见上面）
- ⚠️ 考虑使用Celery异步处理图片压缩（如果启用）

#### 3. 没有看到自动重启配置 ⚠️ **中风险**

**问题**：
- 没有看到PM2或systemd配置
- 如果服务崩溃，需要手动重启

**建议**：
- 配置PM2或systemd自动重启
- 或者使用Docker + restart policy

---

## 📋 修复优先级

### 🔴 高优先级（必须立即修复）

1. **文件上传添加事务保护** - 防止数据不一致
2. **文件路径添加用户ID hash** - 防止文件覆盖
3. **添加文件大小限制** - 防止内存溢出

### 🟡 中优先级（尽快修复）

1. **打卡操作添加事务保护** - 提高数据一致性
2. **配置自动重启** - 提高服务可用性

### 🟢 低优先级（可以稍后优化）

1. **Migration幂等性检查** - 已有保护，但可以加强
2. **异步图片压缩** - 如果启用Celery可以考虑

---

## 📝 总结

### 总体评估

- **并发/队列风险**：⚠️ **中等风险** - 主要问题是文件上传和打卡没有事务保护
- **数据丢失风险**：⚠️ **中等风险** - 主要问题是文件路径没有用户隔离
- **内存泄漏风险**：⚠️ **高风险** - 没有文件大小限制，可能导致服务崩溃

### 建议

1. **立即修复**：文件大小限制、文件路径用户隔离、文件上传事务保护
2. **尽快修复**：打卡操作事务保护、自动重启配置
3. **持续监控**：上线后监控内存使用、文件上传失败率、数据库连接数









