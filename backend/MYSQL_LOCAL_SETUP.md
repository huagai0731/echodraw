# 本地 MySQL 配置指南

## 已完成的配置

✅ 已在 `.env` 文件中添加 MySQL 配置模板
✅ MySQL 驱动 (mysqlclient) 已安装

## 需要你完成的步骤

### 1. 编辑 `.env` 文件，填写你的 MySQL 连接信息

打开 `backend/.env` 文件，找到以下配置并修改：

```env
DJANGO_DB_ENGINE=mysql
DB_NAME=echo                    # 你的数据库名称
DB_USER=root                    # 你的 MySQL 用户名
DB_PASSWORD=your_password_here  # ⚠️ 请修改为你的 MySQL 密码
DB_HOST=localhost               # 如果是远程数据库，改为服务器地址
DB_PORT=3306                    # MySQL 端口，默认 3306
```

### 2. 确保 MySQL 数据库已创建

如果还没有创建数据库，可以通过以下方式创建：

**方法 A：使用 MySQL 命令行**
```bash
mysql -u root -p
CREATE DATABASE echo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

**方法 B：使用 MySQL Workbench 或其他图形工具**
- 创建名为 `echo` 的数据库
- 字符集选择 `utf8mb4`
- 排序规则选择 `utf8mb4_unicode_ci`

### 3. 测试数据库连接

运行以下命令测试连接：

```bash
cd backend
python check_database_status.py
```

或者直接运行 Django 命令：

```bash
python manage.py check --database default
```

### 4. 运行数据库迁移

连接成功后，需要运行迁移来创建表结构：

```bash
python manage.py migrate
```

### 5. 如果之前有 SQLite 数据需要迁移

如果你之前使用 SQLite 并且有数据需要迁移到 MySQL，可以参考 `MIGRATE_SQLITE_TO_MYSQL.md` 文件中的说明。

## 常见问题

### Q: 连接失败，提示 "Access denied"

**A:** 检查 `.env` 文件中的用户名和密码是否正确。

### Q: 连接失败，提示 "Can't connect to MySQL server"

**A:** 
- 检查 MySQL 服务是否正在运行
- 检查 `DB_HOST` 和 `DB_PORT` 是否正确
- 如果是远程数据库，检查防火墙设置

### Q: 迁移时提示表已存在

**A:** 如果数据库已经有表结构，可以：
- 删除现有表后重新迁移（**注意：会丢失数据**）
- 或者使用 `python manage.py migrate --fake` 标记迁移为已完成

### Q: Windows 上安装 mysqlclient 失败

**A:** 如果遇到编译错误，可以：
1. 安装 MySQL Connector/C（从 MySQL 官网下载）
2. 或者使用 `PyMySQL` 作为替代（需要修改 settings.py）

## 验证配置

配置完成后，运行以下命令验证：

```bash
python manage.py check
python manage.py showmigrations
```

如果一切正常，你应该能看到所有迁移都已应用。

