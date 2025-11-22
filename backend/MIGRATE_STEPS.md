# 数据库迁移步骤（SQLite → MySQL）

## 问题

导入时出现错误：`Table 'echo.django_migrations' doesn't exist`

这是因为 MySQL 数据库中还没有创建表结构。

## 解决方案

有两种方法：

### 方法 1：使用 Django 迁移创建表结构（推荐）

这是最可靠的方法，因为 Django 会处理所有表结构和约束：

```bash
cd ~/echo/backend

# 1. 确保 .env 文件配置了 MySQL
# DB_ENGINE=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_NAME=echo
# DB_USER=echo
# DB_PASSWORD=你的密码

# 2. 运行迁移创建表结构
python3 manage.py migrate

# 3. 然后导入数据（只导入数据，不包含表结构）
python3 export_sqlite_to_mysql.py db.sqlite3 echo_data_only.sql

# 4. 导入数据
mysql -u echo -p echo < echo_data_only.sql
```

### 方法 2：使用包含表结构的导出脚本

如果方法 1 不行，可以使用包含表结构的导出：

```bash
cd ~/echo/backend

# 1. 导出包含表结构的 SQL
python3 export_sqlite_to_mysql_with_schema.py db.sqlite3 echo_full.sql

# 2. 导入（会先删除表再创建）
mysql -u echo -p echo < echo_full.sql
```

**注意**：方法 2 会删除现有表，如果 MySQL 中已经有表结构，建议使用方法 1。

## 推荐步骤（完整流程）

```bash
cd ~/echo/backend

# 步骤 1: 检查当前数据库状态
python3 check_database_status.py

# 步骤 2: 确保 .env 配置正确
cat .env | grep DB_

# 步骤 3: 运行 Django 迁移创建表结构
python3 manage.py migrate

# 步骤 4: 导出 SQLite 数据（只导出数据）
python3 export_sqlite_to_mysql.py db.sqlite3 echo_data_only.sql

# 步骤 5: 导入数据
mysql -u echo -p echo < echo_data_only.sql

# 步骤 6: 验证数据
python3 check_database_status.py

# 步骤 7: 测试登录
# 访问网站，尝试登录
```

## 如果迁移失败

如果遇到外键约束错误：

```bash
# 导入时临时禁用外键检查
mysql -u echo -p echo << EOF
SET FOREIGN_KEY_CHECKS = 0;
SOURCE echo_data_only.sql;
SET FOREIGN_KEY_CHECKS = 1;
EOF
```

## 验证迁移结果

```bash
# 检查数据
python3 check_database_status.py

# 或者直接查询
mysql -u echo -p echo -e "SELECT COUNT(*) FROM core_user;"
```








