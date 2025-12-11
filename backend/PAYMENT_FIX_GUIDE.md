# 支付配置修复指南

## 问题诊断结果

根据诊断脚本的输出，发现以下问题：

### 1. ❌ 缺少 `wechatpayv3` Python 包

**错误信息**：
```
ModuleNotFoundError: No module named 'wechatpayv3'
```

**原因**：虚拟环境中没有安装微信支付的 Python 包

**解决方法**：

```bash
# 确保在虚拟环境中
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env  # 或你的虚拟环境激活命令

# 安装依赖
pip install wechatpayv3>=1.0.0

# 或者安装所有依赖
pip install -r requirements.txt
```

### 2. ❌ 缺少 `ALIPAY_APPID` 环境变量

**错误信息**：
```
❌ ALIPAY_APP_ID 未设置
```

**注意**：环境变量名称是 `ALIPAY_APPID`（不是 `ALIPAY_APP_ID`）

**解决方法**：

在环境变量文件（`/www/server/python_project/vhost/env/backend.env` 或 `.env`）中添加：

```bash
ALIPAY_APPID=你的支付宝应用ID
```

### 3. ⚠️ 文件权限问题

虽然文件权限已经设置为 600，但文件所有者是 `www`，而当前用户是 `root`。这可能导致 Django 应用（以 `www` 用户运行）无法读取文件。

**解决方法**：

```bash
# 确保文件所有者是 www（Django 应用运行的用户）
chown www:www /root/echo/backend/pub_key.pem
chown www:www /root/echo/backend/apiclient_key.pem

# 确保权限正确
chmod 600 /root/echo/backend/pub_key.pem
chmod 600 /root/echo/backend/apiclient_key.pem
```

## 完整修复步骤

### 步骤 1：安装缺失的 Python 包

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env

# 安装微信支付包
pip install wechatpayv3>=1.0.0

# 或者安装所有依赖（推荐）
pip install -r requirements.txt
```

### 步骤 2：配置支付宝 APPID

编辑环境变量文件：

```bash
# 如果使用系统环境变量文件
nano /www/server/python_project/vhost/env/backend.env

# 或者如果使用项目 .env 文件
nano /root/echo/backend/.env
```

添加或修改：

```bash
ALIPAY_APPID=你的支付宝应用ID
```

### 步骤 3：修复文件权限

```bash
cd /root/echo/backend

# 修改文件所有者（根据你的 Django 应用运行用户调整）
chown www:www pub_key.pem apiclient_key.pem

# 确保权限正确
chmod 600 pub_key.pem apiclient_key.pem
```

### 步骤 4：验证配置

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env
python3 check_payment_config.py
```

应该看到：

```
✅ 所有配置检查通过！
```

### 步骤 5：重启 Django 服务

```bash
# 如果使用 systemd
sudo systemctl restart gunicorn

# 如果使用 supervisor
sudo supervisorctl restart echo

# 如果使用 pm2
pm2 restart echo
```

## 验证支付功能

修复完成后，在前端测试支付功能：

1. 尝试创建支付宝支付订单
2. 尝试创建微信支付订单

如果仍然出现 500 错误，查看服务器日志：

```bash
# 查看 Django 日志
tail -f /root/echo/backend/logs/*.log

# 或查看 systemd 日志
sudo journalctl -u gunicorn -f
```

## 常见问题

### Q: 如何找到支付宝 APPID？

A: 登录支付宝开放平台（https://open.alipay.com/），在"我的应用"中查看应用 ID。

### Q: 虚拟环境路径是什么？

A: 根据你的系统，虚拟环境可能在：
- `/www/server/python_project/vhost/env/backend.env`（宝塔面板）
- `/root/echo/backend/venv`（项目内虚拟环境）
- 其他自定义路径

使用 `which python3` 或 `pip show django` 可以找到当前使用的 Python 环境。

### Q: Django 应用以什么用户运行？

A: 通常：
- Nginx + Gunicorn：`www` 或 `www-data`
- systemd 服务：查看服务配置文件中的 `User=` 设置
- 宝塔面板：通常是 `www`

使用 `ps aux | grep gunicorn` 可以查看运行用户。

