# 快速修复命令

## 问题：Duplicate column name 'registration_number'

字段已存在，但迁移记录未标记。执行以下命令：

```bash
# 1. 标记迁移 0036 为已应用（因为字段已存在）
python manage.py migrate --fake core 0036

# 2. 继续运行其他迁移
python manage.py migrate

# 3. 重启服务
sudo systemctl restart gunicorn
```

如果还遇到 `core_notification` 表不存在的问题：

```bash
# 如果表已存在但迁移未标记
python manage.py migrate --fake core 0038

# 如果表不存在，正常运行迁移即可
python manage.py migrate
```







