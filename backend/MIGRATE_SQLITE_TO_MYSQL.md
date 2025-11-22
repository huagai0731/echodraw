# 从 SQLite 迁移到 MySQL 完整指南

## 当前情况

你已经配置了 MySQL，但可能：
1. MySQL 数据库是空的（需要从 SQLite 迁移数据）
2. MySQL 连接有问题（需要修复配置）

## 第一步：检查当前状态

```bash
cd ~/echo/backend
python3 check_database_status.py
```

这个脚本会告诉你：
- MySQL 是否能连接
- 数据库中有多少表和数据
- SQLite 文件是否存在

## 第二步：根据情况处理

### 情况 A：MySQL 连接失败

如果显示连接失败，检查：

1. **检查 .env 文件配置**
   ```bash
   cat .env | grep DB_
   ```

2. **在宝塔面板确认**
   - 数据库是否已创建
   - 用户名和密码是否正确
   - 数据库用户是否有权限

3. **测试直接连接**
   ```bash
   mysql -u echo -p echo
   # 输入密码，如果能进入说明配置正确
   ```

### 情况 B：MySQL 连接成功但数据库为空

如果连接成功但没有表或数据，需要从 SQLite 迁移：

```bash
cd ~/echo/backend

# 1. 检查 SQLite 文件是否存在
ls -lh db.sqlite3

# 2. 导出 SQLite 数据
chmod +x export_sqlite_to_mysql.sh
./export_sqlite_to_mysql.sh

# 3. 导入到 MySQL
mysql -u echo -p echo < echo_from_sqlite.sql
```

### 情况 C：MySQL 有数据但登录失败

如果数据库有数据但登录功能不工作，可能是：

1. **数据迁移不完整** - 重新迁移
2. **密码加密方式不同** - 需要重置密码
3. **会话数据丢失** - 清除浏览器缓存

## 完整迁移步骤

### 1. 备份当前数据（以防万一）

```bash
# 备份 SQLite（如果存在）
cp db.sqlite3 db.sqlite3.backup

# 备份 MySQL（如果已有数据）
mysqldump -u echo -p echo > mysql_backup_$(date +%Y%m%d).sql
```

### 2. 从 SQLite 导出

```bash
cd ~/echo/backend
chmod +x export_sqlite_to_mysql.sh
./export_sqlite_to_mysql.sh
```

### 3. 导入到 MySQL

**方法 A：通过宝塔面板**
1. 上传 `echo_from_sqlite.sql` 到服务器
2. 在宝塔面板数据库管理中导入

**方法 B：通过命令行**
```bash
mysql -u echo -p echo < echo_from_sqlite.sql
```

### 4. 验证数据

```bash
python3 check_database_status.py
```

应该看到表和数据记录。

### 5. 测试登录

访问网站，尝试登录。

## 常见问题

### Q: 导入时出现字符编码错误

**A:** 确保导出时使用 utf8mb4：
```bash
# 重新导出
./export_sqlite_to_mysql.sh
# 导入时指定编码
mysql -u echo -p --default-character-set=utf8mb4 echo < echo_from_sqlite.sql
```

### Q: 导入后用户无法登录

**A:** 可能是密码哈希方式不同。可以：
1. 重置用户密码（通过 Django admin 或命令行）
2. 或者重新创建用户

### Q: 导入时出现外键约束错误

**A:** 导入脚本已经设置了 `SET FOREIGN_KEY_CHECKS = 0`，如果还有问题：
```bash
mysql -u echo -p echo << EOF
SET FOREIGN_KEY_CHECKS = 0;
SOURCE echo_from_sqlite.sql;
SET FOREIGN_KEY_CHECKS = 1;
EOF
```

## 验证清单

迁移完成后，检查：

- [ ] MySQL 连接成功
- [ ] 数据库中有表
- [ ] 用户表有数据
- [ ] 可以正常登录
- [ ] 其他功能正常

## 需要帮助？

如果遇到问题：
1. 运行 `python3 check_database_status.py` 查看详细状态
2. 检查 Django 日志：`tail -f logs/django.log`
3. 检查 MySQL 错误日志（在宝塔面板中查看）








