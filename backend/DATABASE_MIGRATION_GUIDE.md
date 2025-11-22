# 数据库迁移指南：本地 → 云服务器（火山云 + 宝塔面板）

## 步骤概览

1. 在云服务器上创建数据库和用户（通过宝塔面板）
2. 从本地导出数据库
3. 导入到云服务器
4. 配置 Django 连接云服务器数据库
5. 验证迁移结果

---

## 步骤 1: 在宝塔面板创建数据库

### 1.1 登录宝塔面板

访问你的宝塔面板地址（通常是 `http://你的服务器IP:8888`）

### 1.2 创建数据库

1. 进入 **数据库** 菜单
2. 点击 **添加数据库**
3. 填写信息：
   - **数据库名**: `echo`（或你想要的名称）
   - **用户名**: `echo`（或你想要的名称）
   - **密码**: 设置一个强密码（**记住这个密码！**）
   - **访问权限**: 选择 `本地服务器`
4. 点击 **提交**

### 1.3 记录数据库信息

创建完成后，记录以下信息（后续会用到）：
- 数据库名: `echo`
- 用户名: `echo`
- 密码: `你设置的密码`
- 主机: `127.0.0.1` 或 `localhost`
- 端口: `3306`

---

## 步骤 2: 从本地导出数据库

### 2.1 在本地机器上导出数据

打开命令行（PowerShell 或 CMD），执行：

```powershell
# 进入项目目录
cd C:\Users\gai\Desktop\echo\backend

# 导出数据库（替换为你的实际数据库信息）
mysqldump -u root -p echo > echo_backup.sql
# 或者如果数据库名不同
mysqldump -u root -p 你的数据库名 > echo_backup.sql
```

**注意**: 
- 会提示输入数据库密码
- 如果 `mysqldump` 命令不存在，需要将 MySQL 的 bin 目录添加到 PATH，或使用完整路径：
  ```powershell
  "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p echo > echo_backup.sql
  ```

### 2.2 验证导出文件

检查文件是否生成：
```powershell
ls echo_backup.sql
# 或
dir echo_backup.sql
```

文件应该包含 SQL 语句（可以用文本编辑器打开查看）。

---

## 步骤 3: 上传并导入到云服务器

### 方法 A: 通过宝塔面板导入（推荐）

1. **上传 SQL 文件**
   - 在宝塔面板中，进入 **文件** 菜单
   - 上传 `echo_backup.sql` 到服务器（例如 `/root/` 目录）

2. **导入数据库**
   - 进入 **数据库** 菜单
   - 找到你创建的 `echo` 数据库
   - 点击 **导入**
   - 选择上传的 `echo_backup.sql` 文件
   - 点击 **导入**

### 方法 B: 通过命令行导入

如果你有 SSH 访问权限：

```bash
# 1. 上传文件到服务器（使用 scp 或其他工具）
# 从本地执行：
scp echo_backup.sql root@你的服务器IP:/root/

# 2. SSH 登录服务器
ssh root@你的服务器IP

# 3. 导入数据库
mysql -u echo -p echo < /root/echo_backup.sql
# 输入你在宝塔面板设置的数据库密码
```

---

## 步骤 4: 配置 Django 连接云服务器数据库

### 4.1 在云服务器上编辑 .env 文件

```bash
cd ~/echo/backend
nano .env
# 或使用 vi
vi .env
```

### 4.2 添加数据库配置

在 `.env` 文件中添加或修改以下配置：

```env
# 数据库配置
DB_ENGINE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=echo
DB_USER=echo
DB_PASSWORD=你在宝塔面板设置的密码

# 可选：如果不想使用自定义后端
MYSQL_USE_CUSTOM_BACKEND=false
```

### 4.3 保存并退出

- 如果使用 `nano`: 按 `Ctrl+X`，然后 `Y`，然后 `Enter`
- 如果使用 `vi`: 按 `Esc`，输入 `:wq`，然后 `Enter`

---

## 步骤 5: 测试数据库连接

### 5.1 测试连接

```bash
cd ~/echo/backend
python3 manage.py dbshell
```

如果连接成功，会进入 MySQL 命令行。输入 `exit` 退出。

### 5.2 运行迁移（如果需要）

```bash
python3 manage.py migrate
```

### 5.3 检查数据库表

```bash
python3 manage.py showmigrations
```

---

## 步骤 6: 重启 Gunicorn

```bash
# 如果使用 systemd
sudo systemctl restart your-gunicorn-service

# 或者如果直接运行
# 先停止当前进程（Ctrl+C），然后重新启动
cd ~/echo/backend
./start_gunicorn.sh
```

---

## 验证迁移结果

### 1. 检查数据是否导入成功

```bash
cd ~/echo/backend
python3 manage.py shell
```

在 Django shell 中：

```python
from core.models import User
print(f"用户数量: {User.objects.count()}")
# 查看是否有数据
```

### 2. 测试登录功能

访问你的网站，尝试登录，看是否能正常工作。

---

## 常见问题排查

### 问题 1: 导入时出现字符编码错误

**解决方法**:
```bash
# 导出时指定编码
mysqldump -u root -p --default-character-set=utf8mb4 echo > echo_backup.sql

# 导入时指定编码
mysql -u echo -p --default-character-set=utf8mb4 echo < echo_backup.sql
```

### 问题 2: 权限错误

**解决方法**:
在宝塔面板的数据库中，确保：
- 数据库用户有 `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `ALTER` 权限
- 或者直接给 `ALL PRIVILEGES`

### 问题 3: 连接被拒绝

**检查项**:
1. MySQL 服务是否运行：`systemctl status mysql`
2. 防火墙是否开放 3306 端口（本地连接不需要）
3. 数据库用户是否允许从 `localhost` 连接

### 问题 4: 密码错误

**解决方法**:
1. 在宝塔面板中重置数据库用户密码
2. 更新 `.env` 文件中的 `DB_PASSWORD`

---

## 快速检查清单

- [ ] 在宝塔面板创建了数据库和用户
- [ ] 从本地导出了数据库文件
- [ ] 上传 SQL 文件到云服务器
- [ ] 在宝塔面板导入数据库
- [ ] 更新了 `.env` 文件中的数据库配置
- [ ] 测试了数据库连接（`python3 manage.py dbshell`）
- [ ] 运行了迁移（如果需要）
- [ ] 重启了 Gunicorn
- [ ] 测试了登录功能

---

## 后续优化建议

1. **定期备份**: 在宝塔面板设置数据库自动备份
2. **性能优化**: 根据数据量调整 MySQL 配置
3. **监控**: 设置数据库监控和告警
4. **安全**: 确保数据库用户权限最小化

---

## 需要帮助？

如果遇到问题，可以：
1. 检查 Django 日志：`tail -f ~/echo/backend/logs/django.log`
2. 检查 MySQL 日志：在宝塔面板查看 MySQL 错误日志
3. 运行诊断脚本：`python3 check_gunicorn.py`








