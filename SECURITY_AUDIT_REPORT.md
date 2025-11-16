# 安全审计报告

## 审计日期
2025-01-XX

## 审计范围
针对用户提出的三种安全风险进行全面检查：
1. 任意用户数据泄露
2. 文件上传漏洞
3. XSS / 跨站脚本攻击

---

## 一、任意用户数据泄露风险

### ✅ 已做好的地方

1. **用户上传图片访问权限检查**
   - 位置：`backend/core/views.py:773`
   - 代码：`upload = get_object_or_404(UserUpload, pk=pk, user=user)`
   - 说明：正确使用了 `user=user` 过滤，确保用户只能访问自己的上传

2. **用户数据查询过滤**
   - `UserUploadListCreateView` (第659行)：`UserUpload.objects.filter(user=self.request.user)`
   - `UserUploadDetailView` (第709行)：`UserUpload.objects.filter(user=self.request.user)`
   - `ShortTermGoalListCreateView` (第817行)：`ShortTermGoal.objects.filter(user=self.request.user)`
   - `ShortTermGoalDetailView` (第833行)：`ShortTermGoal.objects.filter(user=self.request.user)`
   - `UserTaskPresetListCreateView` (第845行)：`UserTaskPreset.objects.filter(user=self.request.user)`
   - `UserTaskPresetDetailView` (第863行)：`UserTaskPreset.objects.filter(user=self.request.user)`

3. **用户信息返回字段控制**
   - `_user_payload` 函数（第131-139行）只返回必要字段：
     - id, email, is_staff, is_active, first_name, last_name
     - 没有返回敏感信息如密码哈希等

### ⚠️ 潜在风险点

1. **API返回字段可能过多**
   - `UserUploadSerializer` 返回了所有字段，包括 `notes`（内部备注）
   - 建议：如果 `notes` 是内部数据，不应该返回给前端
   - 位置：`backend/core/serializers.py:108-120`

2. **文件路径暴露**
   - 文件存储路径：`uploads/{user_hash}/{uuid}.{ext}`
   - 虽然使用了UUID，但路径结构可能暴露用户ID的hash
   - 位置：`backend/core/models.py:13-23`
   - 建议：路径可以更随机化，避免可预测

3. **图片访问权限**
   - `UserUploadImageView` 允许通过 token 访问（第738-748行）
   - 如果 token 泄露，可能导致未授权访问
   - 建议：考虑添加更严格的访问控制

---

## 二、文件上传漏洞

### ✅ 已做好的地方

1. **文件大小限制**
   - 位置：`backend/core/serializers.py:95-104`
   - 限制：10MB
   - 说明：有效防止过大文件攻击

2. **文件重命名**
   - 位置：`backend/core/models.py:13-23`
   - 使用UUID作为文件名，避免原始文件名暴露
   - 说明：防止路径遍历和文件名冲突

3. **图片处理**
   - 位置：`backend/core/serializers.py:129-157`
   - 使用PIL进行图片压缩和格式转换
   - 说明：PIL处理会验证图片格式，一定程度上防止恶意文件

### ❌ 严重问题

1. **缺少MIME类型验证**
   - **风险等级：高**
   - 问题：只验证了文件大小，没有验证MIME类型
   - 位置：`backend/core/serializers.py:95-104`
   - 风险：用户可能上传 `.php` 或 `.js` 文件伪装成图片
   - 建议：
     ```python
     ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
     
     def validate_image(self, value):
         if value is None:
             return value
         # 验证MIME类型
         if hasattr(value, 'content_type'):
             if value.content_type not in ALLOWED_MIME_TYPES:
                 raise serializers.ValidationError(
                     f"不支持的文件类型：{value.content_type}"
                 )
         # 验证文件大小
         max_size = 10 * 1024 * 1024
         if value.size > max_size:
             raise serializers.ValidationError(...)
         return value
     ```

2. **文件存储在服务器本地**
   - **风险等级：中**
   - 问题：文件存储在 `backend/media/uploads/` 目录
   - 位置：`backend/core/models.py:172-177`
   - 风险：如果Web服务器配置不当，可能直接执行上传的文件
   - 建议：
     - 使用对象存储（OSS/S3/TOS）
     - 如果必须本地存储，确保：
       1. 文件存储在Web根目录外
       2. 通过Django视图代理访问，不直接暴露文件路径
       3. 设置正确的Content-Type头

3. **图片处理异常回退**
   - **风险等级：低**
   - 问题：`_compress_image` 函数在异常时回退使用原文件（第156行）
   - 位置：`backend/core/serializers.py:155-157`
   - 风险：如果PIL处理失败，可能保存恶意文件
   - 建议：处理失败时应该拒绝上传，而不是回退

---

## 三、XSS / 跨站脚本攻击

### ✅ 已做好的地方

1. **没有使用 innerHTML**
   - 检查结果：前端代码中没有找到 `innerHTML` 或 `dangerouslySetInnerHTML` 的使用
   - 说明：React默认会转义用户输入，这是好的

2. **Django模板自动转义**
   - Django模板系统默认会转义所有变量
   - 位置：`backend/config/settings.py:80-93`

### ⚠️ 潜在风险点

1. **用户输入直接渲染**
   - 需要检查所有用户输入字段在前端的渲染方式
   - 关键字段：
     - `UserUpload.title` - 作品标题
     - `UserUpload.notes` - 作品描述
     - `UserProfile.display_name` - 显示名称
     - `UserProfile.signature` - 个人签名
     - `ShortTermGoal.title` - 挑战名称
     - `UserTaskPreset.title` - 任务名称
     - `UserTaskPreset.description` - 任务描述

2. **API返回的文本字段**
   - 所有文本字段都应该在前端使用 `textContent` 或 React 的默认转义
   - 建议：检查前端组件是否都使用了安全的渲染方式

3. **JSON数据注入**
   - `tags`、`metadata` 等JSON字段需要确保不会导致XSS
   - 位置：`backend/core/models.py:161-164`

### 🔍 需要进一步检查

由于前端代码使用React，默认会转义，但需要确认：
1. 是否有使用 `dangerouslySetInnerHTML` 的地方（已检查，未发现）
2. 是否有直接操作DOM的地方
3. 是否有使用 `eval()` 或 `new Function()` 的地方

---

## 修复建议优先级

### 🔴 高优先级（必须立即修复）

1. **添加MIME类型验证**
   - 文件：`backend/core/serializers.py`
   - 位置：`validate_image` 方法
   - 影响：防止恶意文件上传

### 🟡 中优先级（建议尽快修复）

1. **迁移到对象存储**
   - 文件：`backend/core/models.py`、`backend/config/storage.py`
   - 影响：防止文件执行漏洞

2. **优化文件路径**
   - 文件：`backend/core/models.py:13-23`
   - 影响：减少信息泄露风险

3. **移除内部字段返回**
   - 文件：`backend/core/serializers.py:108-120`
   - 影响：减少数据泄露

### 🟢 低优先级（可以后续优化）

1. **改进图片处理错误处理**
   - 文件：`backend/core/serializers.py:155-157`
   - 影响：提高安全性

2. **前端XSS防护检查**
   - 全面检查前端组件
   - 确保所有用户输入都正确转义

---

## 总结

### 当前安全状态
- ✅ 用户权限检查：**良好** - 大部分API都有正确的权限过滤
- ⚠️ 文件上传：**存在风险** - 缺少MIME验证，文件存储在本地
- ✅ XSS防护：**良好** - React默认转义，未发现明显风险

### 建议行动
1. **立即修复**：添加MIME类型验证
2. **尽快修复**：迁移到对象存储或加强本地存储安全
3. **持续监控**：定期检查新代码的安全实践

---

## 附录：代码位置索引

### 关键文件
- `backend/core/views.py` - API视图，权限检查
- `backend/core/serializers.py` - 数据序列化，文件验证
- `backend/core/models.py` - 数据模型，文件路径
- `frontend/src/` - 前端React组件

### 关键函数
- `UserUploadSerializer.validate_image()` - 文件验证（需要加强）
- `UserUploadImageView.get()` - 图片访问权限检查
- `_user_payload()` - 用户信息返回（字段控制）


