# 数据库迁移修复说明

## 问题描述

云服务器上的数据库缺少 `is_member` 字段，导致以下API返回500错误：
- `/api/profile/preferences/`
- `/api/profile/featured-artworks/`
- `/api/visual-analysis/quota/`

错误信息：
```
pymysql.err.OperationalError: (1054, "Unknown column 'core_userprofile.is_member' in 'field list'")
```

## 原因

数据库迁移文件 `0080_add_membership_and_visual_analysis_quota.py` 在云服务器上未执行，导致数据库表结构与代码不一致。

## 解决步骤

### 1. 登录云服务器

```bash
ssh root@115.190.238.247
```

### 2. 进入项目目录

```bash
cd /root/echo/backend
```

### 3. 激活虚拟环境（如果使用）

```bash
# 如果使用虚拟环境，先激活
source venv/bin/activate  # 或其他虚拟环境路径
```

### 4. 检查当前迁移状态

```bash
python manage.py showmigrations core
```

这会显示哪些迁移已应用，哪些未应用。

### 5. 解决迁移冲突（如果出现）

如果遇到以下错误：
```
CommandError: Conflicting migrations detected; multiple leaf nodes in the migration graph
```

需要先创建合并迁移：

```bash
python manage.py makemigrations --merge
```

这会创建一个新的合并迁移文件（通常是 `0086_merge_xxxxx.py`），解决两个并行迁移分支的冲突。

### 6. 执行数据库迁移

```bash
python manage.py migrate
```

这会执行所有未应用的迁移，包括：
- `0080_add_membership_and_visual_analysis_quota.py` - 添加 `is_member` 字段和 `VisualAnalysisQuota` 模型
- `0081_add_membership_expires.py` - 添加 `membership_expires` 字段
- `0082_add_featured_artwork_ids.py` - 添加 `featured_artwork_ids` 字段
- `0083_add_membership_started_at.py` - 添加 `membership_started_at` 字段
- `0084_fix_emailverification_auto_increment.py` - 修复自动递增问题
- `0085_remove_highfiveclick_user_delete_highfivecounter_and_more.py` - 删除 HighFive 相关模型（如果存在）
- 合并迁移（如果创建了）

### 7. 验证迁移成功

```bash
# 再次检查迁移状态，应该显示所有迁移都已应用
python manage.py showmigrations core

# 或者直接测试数据库连接和字段是否存在
python manage.py shell
```

在 Django shell 中测试：
```python
from core.models import UserProfile
# 检查字段是否存在
print(UserProfile._meta.get_field('is_member'))
# 应该输出：core.UserProfile.is_member
```

### 8. 重启服务（如果需要）

如果使用 systemd 或其他进程管理器，重启 Django 服务：

```bash
# 例如使用 systemd
sudo systemctl restart echo-backend

# 或使用 supervisor
supervisorctl restart echo-backend

# 或使用 gunicorn/uwsgi
# 根据你的部署方式重启
```

## 预防措施

为了避免将来出现类似问题，建议：

1. **在部署脚本中添加迁移步骤**：
   ```bash
   # 在部署脚本中
   cd /root/echo/backend
   python manage.py migrate
   ```

2. **使用 CI/CD 流程**：在部署前自动检查迁移状态

3. **定期检查**：定期运行 `python manage.py showmigrations` 确保所有迁移都已应用

## 注意事项

- 执行迁移前建议备份数据库
- 如果生产环境有大量数据，迁移可能需要一些时间
- 确保在维护窗口期间执行，或确保应用可以短暂停机

## 如果迁移已应用但字段仍然缺失

如果 `showmigrations` 显示迁移已应用，但数据库表仍然缺少字段，可以手动执行 SQL 修复：

### 方法1：使用修复脚本（推荐）

```bash
cd /root/echo/backend
python3 fix_is_member_field.py
```

### 方法2：直接执行 SQL

连接到 MySQL 数据库：

```bash
mysql -u your_username -p your_database_name
```

然后执行：

```sql
-- 检查字段是否存在
SELECT COUNT(*) 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'core_userprofile'
AND COLUMN_NAME = 'is_member';

-- 如果返回 0，则添加字段
ALTER TABLE `core_userprofile`
ADD COLUMN `is_member` BOOLEAN NOT NULL DEFAULT 0;

-- 检查其他可能缺失的字段
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'core_userprofile'
AND COLUMN_NAME IN ('is_member', 'membership_expires', 'membership_started_at', 'featured_artwork_ids');
```

如果其他字段也缺失，可以添加：

```sql
-- 添加 membership_expires 字段（如果缺失）
ALTER TABLE `core_userprofile`
ADD COLUMN `membership_expires` DATETIME NULL;

-- 添加 membership_started_at 字段（如果缺失）
ALTER TABLE `core_userprofile`
ADD COLUMN `membership_started_at` DATETIME NULL;

-- 添加 featured_artwork_ids 字段（如果缺失）
ALTER TABLE `core_userprofile`
ADD COLUMN `featured_artwork_ids` JSON NOT NULL DEFAULT (JSON_ARRAY());
```

## 如果迁移失败

如果迁移过程中出现错误：

1. 检查数据库连接是否正常
2. 检查数据库用户是否有足够权限
3. 查看详细的错误信息并解决
4. 如果问题严重，可以从备份恢复数据库

