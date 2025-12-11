# 修复 PointsOrder.metadata 字段缺失问题

## 问题描述

错误信息：
```
Unknown column 'core_pointsorder.metadata' in 'field list'
```

这表明数据库中的 `PointsOrder` 表缺少 `metadata` 字段。

## 解决方案

### 方法 1：运行数据库迁移（推荐）

在服务器上运行：

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env

# 检查迁移状态
python3 manage.py showmigrations core | grep points

# 运行迁移
python3 manage.py migrate core
```

### 方法 2：如果迁移文件不存在，创建迁移

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env

# 创建迁移
python3 manage.py makemigrations core

# 运行迁移
python3 manage.py migrate core
```

### 方法 3：手动添加字段（如果迁移失败）

如果迁移失败，可以手动在数据库中添加字段：

```sql
-- 连接到 MySQL
mysql -u your_user -p your_database

-- 添加 metadata 字段
ALTER TABLE core_pointsorder 
ADD COLUMN metadata JSON DEFAULT ('{}') NOT NULL;
```

## 验证

迁移完成后，验证字段是否存在：

```bash
# 在 Django shell 中验证
python3 manage.py shell
```

```python
from core.models import PointsOrder
from django.db import connection

# 检查表结构
with connection.cursor() as cursor:
    cursor.execute("DESCRIBE core_pointsorder")
    columns = cursor.fetchall()
    for col in columns:
        print(col)

# 或者直接检查字段
print(PointsOrder._meta.get_field('metadata'))
```

## 注意事项

1. **备份数据库**：在运行迁移前，建议备份数据库
2. **检查迁移状态**：使用 `showmigrations` 查看哪些迁移已应用
3. **如果迁移冲突**：可能需要手动解决迁移冲突

## 快速修复命令

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env

# 1. 检查迁移状态
python3 manage.py showmigrations core

# 2. 运行所有未应用的迁移
python3 manage.py migrate

# 3. 如果特定迁移未应用，强制标记为已应用（谨慎使用）
# python3 manage.py migrate core 0086 --fake

# 4. 重启服务
sudo systemctl restart gunicorn  # 或你的服务管理命令
```

