# 配置云端 MySQL 连接

## 步骤 1: 获取云端 MySQL 连接信息

你需要从云端服务器获取以下信息：

1. **数据库主机地址** (DB_HOST)
   - 例如：`115.190.238.247` 或 `mysql.yourdomain.com`
   - 如果是云服务器，通常是服务器的公网 IP

2. **数据库端口** (DB_PORT)
   - 通常是 `3306`（MySQL 默认端口）
   - 如果服务器修改了端口，使用实际端口

3. **数据库名称** (DB_NAME)
   - 例如：`echo`

4. **数据库用户名** (DB_USER)
   - 例如：`root` 或其他用户名

5. **数据库密码** (DB_PASSWORD)
   - 你的 MySQL 密码

## 步骤 2: 修改 .env 文件

编辑 `backend/.env` 文件，修改以下配置：

```env
# MySQL 数据库配置（云端）
DJANGO_DB_ENGINE=mysql
DB_NAME=echo
DB_USER=你的数据库用户名
DB_PASSWORD=你的数据库密码
DB_HOST=你的服务器IP或域名
DB_PORT=3306
```

**示例：**
```env
DJANGO_DB_ENGINE=mysql
DB_NAME=echo
DB_USER=root
DB_PASSWORD=your_password
DB_HOST=115.190.238.247
DB_PORT=3306
```

## 步骤 3: 确保云端 MySQL 允许远程连接

### 3.1 检查 MySQL 是否监听外部连接

在云端服务器上运行：
```bash
netstat -tlnp | grep 3306
```

应该看到类似：
```
tcp  0  0  0.0.0.0:3306  0.0.0.0:*  LISTEN
```

如果是 `127.0.0.1:3306`，说明只监听本地连接，需要修改配置。

### 3.2 修改 MySQL 配置允许远程连接

在云端服务器的 MySQL 配置文件中（通常是 `/etc/mysql/my.cnf` 或 `/etc/my.cnf`）：

找到 `bind-address` 配置，改为：
```ini
bind-address = 0.0.0.0
```

或者注释掉：
```ini
# bind-address = 127.0.0.1
```

然后重启 MySQL 服务：
```bash
sudo systemctl restart mysql
# 或
sudo service mysql restart
```

### 3.3 创建允许远程连接的用户

在云端服务器上登录 MySQL：
```bash
mysql -u root -p
```

然后执行：
```sql
-- 创建允许从任何 IP 连接的用户（不推荐，安全性较低）
CREATE USER 'echo_user'@'%' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON echo.* TO 'echo_user'@'%';
FLUSH PRIVILEGES;

-- 或者，只允许从你的本地 IP 连接（推荐）
CREATE USER 'echo_user'@'你的本地IP' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON echo.* TO 'echo_user'@'你的本地IP';
FLUSH PRIVILEGES;
```

### 3.4 检查防火墙

确保云端服务器的防火墙允许 3306 端口：

**如果使用宝塔面板：**
- 在"安全"设置中，添加端口 3306 的放行规则

**如果使用 iptables：**
```bash
sudo iptables -A INPUT -p tcp --dport 3306 -j ACCEPT
sudo iptables-save
```

**如果使用 ufw（Ubuntu）：**
```bash
sudo ufw allow 3306/tcp
```

**如果使用云服务商的安全组：**
- 在云服务商控制台（如阿里云、腾讯云）的安全组设置中，添加入站规则，允许 3306 端口

## 步骤 4: 测试连接

配置完成后，在本地运行：

```powershell
python check_current_database.py
```

如果看到 "✅ MySQL 连接成功！"，说明配置正确。

## 步骤 5: 运行数据库迁移

连接成功后，运行迁移创建表结构：

```powershell
python manage.py migrate
```

## 常见问题

### Q: 连接失败，提示 "Can't connect to MySQL server"

**A:** 可能的原因：
1. 服务器 IP 或端口错误
2. 防火墙阻止了连接
3. MySQL 未监听外部连接（bind-address 设置错误）

### Q: 连接失败，提示 "Access denied"

**A:** 可能的原因：
1. 用户名或密码错误
2. 用户没有远程连接权限（需要使用 `@'%'` 或 `@'你的IP'`）
3. 数据库不存在

### Q: 连接很慢

**A:** 
- 检查网络连接
- 考虑使用 SSH 隧道（更安全）

## 安全建议

1. **不要使用 root 用户远程连接**
   - 创建专门的数据库用户
   - 只授予必要的权限

2. **限制访问 IP**
   - 只允许你的本地 IP 连接，而不是 `%`（所有 IP）

3. **使用强密码**
   - 密码应该足够复杂

4. **考虑使用 SSH 隧道**（更安全）
   - 不直接暴露 MySQL 端口到公网
   - 通过 SSH 隧道连接

## 使用 SSH 隧道（可选，更安全）

如果你有 SSH 访问权限，可以使用 SSH 隧道：

```powershell
# 建立 SSH 隧道
ssh -L 3306:localhost:3306 user@your-server-ip

# 然后在另一个终端，.env 文件中使用：
DB_HOST=127.0.0.1
DB_PORT=3306
```

这样 MySQL 连接会通过 SSH 隧道，更安全。

