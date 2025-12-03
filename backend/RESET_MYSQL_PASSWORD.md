# MySQL 密码重置指南

## 情况说明

你的 MySQL 服务正在运行（安装在 `D:\mysql`），但无法使用常见密码连接。

## 方法 1: 使用 MySQL 命令行工具重置密码（推荐）

### 步骤 1: 找到 MySQL 命令行工具

MySQL 安装在 `D:\mysql\bin\`，命令行工具应该是 `mysql.exe`。

### 步骤 2: 停止 MySQL 服务

以管理员身份打开 PowerShell，运行：

```powershell
Stop-Service mysql
```

### 步骤 3: 以跳过权限表模式启动 MySQL

```powershell
cd D:\mysql\bin
.\mysqld.exe --skip-grant-tables --console
```

保持这个窗口打开，MySQL 会以前台模式运行。

### 步骤 4: 打开新的 PowerShell 窗口，连接 MySQL

```powershell
cd D:\mysql\bin
.\mysql.exe -u root
```

### 步骤 5: 重置密码

在 MySQL 命令行中执行：

```sql
USE mysql;
UPDATE user SET authentication_string=PASSWORD('你的新密码') WHERE User='root';
FLUSH PRIVILEGES;
EXIT;
```

**注意**: 如果 MySQL 8.0+ 版本，使用以下命令：

```sql
USE mysql;
ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新密码';
FLUSH PRIVILEGES;
EXIT;
```

### 步骤 6: 关闭跳过权限表的 MySQL，正常启动服务

1. 关闭步骤 3 中打开的窗口（Ctrl+C）
2. 正常启动 MySQL 服务：

```powershell
Start-Service mysql
```

### 步骤 7: 测试新密码

```powershell
cd D:\mysql\bin
.\mysql.exe -u root -p
# 输入你设置的新密码
```

## 方法 2: 使用 MySQL Workbench 或其他图形工具

如果你安装了 MySQL Workbench：

1. 打开 MySQL Workbench
2. 尝试使用 "Reset Password" 功能
3. 或者使用 "Manage Server Connections" 测试不同的密码

## 方法 3: 查找已保存的密码

检查以下位置是否有保存的密码：

1. **密码管理器**（如 LastPass, 1Password 等）
2. **文档或笔记**（安装 MySQL 时可能记录过）
3. **其他配置文件**：
   - 检查项目中是否有其他 `.env` 文件
   - 检查是否有数据库备份脚本包含密码
   - 检查云端服务器的配置（如果本地和云端使用相同密码）

## 方法 4: 创建新用户（如果无法重置 root 密码）

如果无法重置 root 密码，可以创建一个新用户：

### 步骤 1: 以跳过权限表模式启动 MySQL（同方法 1 的步骤 2-3）

### 步骤 2: 创建新用户

```sql
USE mysql;
CREATE USER 'echo_user'@'localhost' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON *.* TO 'echo_user'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
EXIT;
```

然后在 `.env` 文件中使用：

```env
DB_USER=echo_user
DB_PASSWORD=你的密码
```

## 方法 5: 检查云端服务器的配置

如果你知道云端服务器的 MySQL 密码，可以：

1. 检查云端服务器的 `.env` 文件
2. 如果本地和云端使用相同的 MySQL 配置，直接复制密码

## 快速测试脚本

重置密码后，运行以下命令测试：

```powershell
cd backend
python test_mysql_connection.py
```

或者直接测试：

```powershell
cd D:\mysql\bin
.\mysql.exe -u root -p
```

## 更新 .env 文件

找到正确的密码后，编辑 `backend/.env` 文件：

```env
DJANGO_DB_ENGINE=mysql
DB_NAME=echo
DB_USER=root
DB_PASSWORD=你的实际密码
DB_HOST=localhost
DB_PORT=3306
```

## 常见问题

### Q: 忘记停止 MySQL 服务就启动跳过权限表的模式

**A:** 会提示端口被占用。先停止服务：
```powershell
Stop-Service mysql
```

### Q: 重置密码后仍然无法连接

**A:** 
1. 确保 MySQL 服务已正常启动（不是跳过权限表模式）
2. 检查密码是否正确（注意大小写和特殊字符）
3. 尝试重启 MySQL 服务：
```powershell
Restart-Service mysql
```

### Q: 找不到 mysql.exe

**A:** 检查 MySQL 安装目录，可能路径不同。查找：
```powershell
Get-ChildItem -Path "D:\mysql" -Filter "mysql.exe" -Recurse
```

