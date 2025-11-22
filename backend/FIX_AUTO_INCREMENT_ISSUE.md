# 修复 MySQL AUTO_INCREMENT 问题

## 问题描述

错误信息：`Field 'id' doesn't have a default value`

这个错误通常发生在从 SQLite 迁移到 MySQL 时，或者数据库表结构没有正确创建时。`DailyCheckIn` 表的 `id` 字段没有设置为 `AUTO_INCREMENT`，导致插入数据时 MySQL 要求必须提供 `id` 值。

## 解决方案

### 方法 1：使用 Django 迁移（推荐）

在服务器上执行：

```bash
cd /root/echo/backend
python manage.py migrate
```

这将自动运行 `0041_fix_dailycheckin_auto_increment` 迁移，修复表结构。

### 方法 2：直接执行 SQL 脚本

如果迁移无法正常工作，可以直接执行 SQL 脚本：

```bash
cd /root/echo/backend
mysql -u用户名 -p数据库名 < fix_auto_increment.sql
```

或者使用环境变量：

```bash
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASSWORD $DB_NAME < fix_auto_increment.sql
```

### 方法 3：使用 Shell 脚本

```bash
cd /root/echo/backend
chmod +x fix_auto_increment.sh
./fix_auto_increment.sh
```

### 方法 4：手动执行 SQL

连接到 MySQL 数据库，然后执行：

```sql
ALTER TABLE `core_dailycheckin`
MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL;
```

## 验证修复

执行以下 SQL 查询验证修复是否成功：

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'core_dailycheckin'
AND COLUMN_NAME = 'id';
```

应该看到 `EXTRA` 列包含 `auto_increment`。

## 其他可能有同样问题的表

如果其他表也出现类似问题，可以使用相同的 SQL 语句修复：

```sql
ALTER TABLE `表名`
MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL;
```

## 预防措施

确保在部署到生产环境前：
1. 所有迁移都已正确执行
2. 数据库表结构与 Django 模型定义一致
3. 使用 `python manage.py migrate --plan` 检查待执行的迁移







