# 修复 MySQL 网络连接问题

## 问题说明

你的 Django 已经配置为使用 MySQL，但连接失败，错误信息：`Can't connect to server on 'localhost' (10061)`

**原因**：MySQL 的 `skip_networking` 设置为 `ON`，禁用了 TCP/IP 网络连接。

## 解决方案

### 步骤 1: 修改 MySQL 配置文件

1. **打开 MySQL 配置文件**
   - 文件路径：`D:\mysql\my.ini`
   - 用记事本或其他文本编辑器打开（可能需要管理员权限）

2. **在 `[mysqld]` 部分添加或修改以下行**
   
   找到 `[mysqld]` 部分（大约在第 1 行），添加：
   ```ini
   [mysqld]
   # 设置3306端口
   port=3306
   # 启用网络连接（允许 TCP/IP 连接）
   skip-networking=OFF
   # 设置mysql的安装目录
   basedir=D:\\mysql
   ```

   或者如果已经有 `skip-networking` 行，将其改为：
   ```ini
   skip-networking=OFF
   ```

### 步骤 2: 重启 MySQL 服务

**方法 A: 使用 PowerShell（需要管理员权限）**
```powershell
# 以管理员身份运行 PowerShell
Restart-Service mysql
```

**方法 B: 使用服务管理器**
1. 按 `Win + R`，输入 `services.msc`，回车
2. 找到 `MySQL` 服务
3. 右键点击，选择"重新启动"

**方法 C: 如果服务无法重启，手动停止和启动**
```powershell
# 停止 MySQL 进程
Stop-Process -Name mysqld -Force

# 等待几秒后，重新启动 MySQL
# 方法1: 通过服务启动
Start-Service mysql

# 方法2: 直接启动 mysqld
cd D:\mysql\bin
.\mysqld.exe --console
```

### 步骤 3: 验证修复

运行以下命令检查：
```powershell
cd C:\Users\gai\Desktop\echo\backend
python check_current_database.py
```

如果看到 "✅ MySQL 连接成功！"，说明问题已解决。

## 如果仍然无法连接

### 检查 MySQL 是否正在监听端口

```powershell
netstat -an | Select-String "3306"
```

应该看到类似 `0.0.0.0:3306` 或 `127.0.0.1:3306` 的输出。

### 检查防火墙

Windows 防火墙可能阻止了 MySQL 端口。可以：
1. 临时关闭防火墙测试
2. 或者在防火墙中添加 MySQL 端口 3306 的例外

### 使用命名管道连接（Windows 特有）

如果 TCP/IP 连接仍然有问题，可以尝试使用命名管道。修改 `backend/.env` 文件：

```env
DB_HOST=.
```

或者使用 `127.0.0.1` 而不是 `localhost`：

```env
DB_HOST=127.0.0.1
```

## 完成后的下一步

修复连接后，需要：

1. **创建数据库（如果还没有）**
   ```powershell
   $env:MYSQL_PWD='huangming0731'
   D:\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS echo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```

2. **运行 Django 迁移**
   ```powershell
   python manage.py migrate
   ```

3. **验证一切正常**
   ```powershell
   python check_current_database.py
   ```

