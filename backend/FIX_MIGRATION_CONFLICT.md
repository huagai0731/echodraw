# 解决迁移冲突

## 问题

有两个迁移文件都使用 0086：
- `0086_add_points_order_metadata` - 添加 metadata 字段
- `0086_merge_20251207_1202` - 合并迁移

## 解决方案

### 方法 1：创建合并迁移（推荐）

在服务器上运行：

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env

# 创建合并迁移
python3 manage.py makemigrations --merge core

# 运行合并后的迁移
python3 manage.py migrate core
```

### 方法 2：手动解决（如果方法1失败）

如果合并迁移创建失败，可以手动编辑迁移文件：

1. 检查两个迁移文件的依赖关系
2. 创建一个新的合并迁移文件
3. 确保两个迁移都作为依赖

### 方法 3：直接添加字段（快速修复）

如果迁移冲突太复杂，可以直接在数据库中添加字段：

```bash
# 连接到 MySQL
mysql -u your_db_user -p your_database_name
```

```sql
-- 检查字段是否已存在
DESCRIBE core_pointsorder;

-- 如果不存在，添加字段
ALTER TABLE core_pointsorder 
ADD COLUMN metadata JSON DEFAULT ('{}') NOT NULL;

-- 验证
DESCRIBE core_pointsorder;
```

然后标记迁移为已应用：

```bash
python3 manage.py migrate core 0086_add_points_order_metadata --fake
```

## 推荐步骤

1. 先尝试方法 1（创建合并迁移）
2. 如果失败，使用方法 3（直接添加字段并标记为已应用）
3. 验证字段是否存在

