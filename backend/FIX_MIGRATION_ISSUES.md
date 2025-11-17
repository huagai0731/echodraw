# 修复数据库迁移问题

## 问题描述

部署到云服务器后出现以下错误：

1. `Unknown column 'core_userprofile.registration_number' in 'field list'`
   - UserProfile 表缺少 `registration_number` 字段

2. `Table 'echo.core_notification' doesn't exist`
   - 缺少 `core_notification` 表

## 原因

数据库未应用最新的迁移文件。需要运行 Django 迁移命令。

## 解决步骤

### 1. 连接到云服务器

```bash
ssh root@your-server-ip
```

### 2. 进入项目目录

```bash
cd /root/echo/backend
```

### 3. 激活虚拟环境（如果使用）

```bash
# 如果使用虚拟环境
source venv/bin/activate  # 或 source .venv/bin/activate
```

### 4. 检查当前迁移状态

```bash
python manage.py showmigrations core
```

这会显示哪些迁移已应用（[X]），哪些未应用（[ ]）。

### 5. 应用所有迁移

```bash
python manage.py migrate
```

这会应用所有未应用的迁移，包括：
- `0036_add_registration_number` - 添加 registration_number 字段
- `0037_assign_registration_numbers` - 为现有用户分配注册编号
- `0038_notification` - 创建 Notification 表

### 6. 验证迁移结果

检查迁移状态，确认所有迁移都已应用：

```bash
python manage.py showmigrations core
```

应该看到所有迁移都标记为 `[X]`。

### 7. 重启应用服务

迁移完成后，重启 Django 应用：

```bash
# 如果使用 systemd
sudo systemctl restart gunicorn
# 或
sudo systemctl restart echo

# 如果使用 supervisor
sudo supervisorctl restart echo

# 如果手动运行 gunicorn
# 停止当前进程，然后重新启动
```

## 注意事项

1. **备份数据库**：在生产环境执行迁移前，建议先备份数据库：
   ```bash
   mysqldump -u root -p echo > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **检查环境变量**：确保数据库连接配置正确：
   ```bash
   echo $DB_ENGINE
   echo $DB_HOST
   echo $DB_NAME
   ```

3. **迁移顺序**：迁移会按照依赖关系自动执行，无需手动指定顺序。

## 故障排除

### 错误：Field 'id' doesn't have a default value

如果在运行迁移时遇到 `django_migrations` 表的 AUTO_INCREMENT 错误：

```bash
# 1. 修复 django_migrations 表的 AUTO_INCREMENT
chmod +x fix_django_migrations_auto_increment.sh
./fix_django_migrations_auto_increment.sh

# 或者直接执行 SQL
mysql -u root -p echo < fix_django_migrations_auto_increment.sql

# 2. 然后重新运行迁移
python manage.py migrate
```

### 如果迁移失败

1. **检查数据库连接**：
   ```bash
   python manage.py dbshell
   ```

2. **查看详细错误信息**：
   ```bash
   python manage.py migrate --verbosity=2
   ```

3. **如果遇到冲突**，可以尝试：
   ```bash
   # 标记迁移为已应用（仅当数据库结构已手动更新时使用）
   python manage.py migrate --fake core 0036
   python manage.py migrate --fake core 0037
   python manage.py migrate --fake core 0038
   ```

### 如果表已存在但迁移未标记

如果数据库表已经存在（例如从其他环境导入），但迁移记录未标记，可以使用 `--fake` 标记：

```bash
python manage.py migrate --fake core 0038
```

## 相关迁移文件

- `backend/core/migrations/0036_add_registration_number.py` - 添加 registration_number 字段到 UserProfile
- `backend/core/migrations/0037_assign_registration_numbers.py` - 为现有用户分配注册编号
- `backend/core/migrations/0038_notification.py` - 创建 Notification 模型和表

## 验证

迁移成功后，可以通过以下方式验证：

1. **检查数据库表结构**：
   ```sql
   DESCRIBE core_userprofile;
   DESCRIBE core_notification;
   ```

2. **通过 Django shell**：
   ```bash
   python manage.py shell
   ```
   ```python
   from core.models import UserProfile, Notification
   UserProfile._meta.get_field('registration_number')  # 应该存在
   Notification.objects.count()  # 应该可以查询
   ```

