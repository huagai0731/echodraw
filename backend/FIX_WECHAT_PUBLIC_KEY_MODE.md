# 修复微信支付公钥模式问题

## 问题描述

虽然已经设置了 `WECHAT_PUBLIC_KEY_ID` 环境变量，但代码仍然使用平台证书模式，导致签名验证失败。

## 可能的原因

1. **环境变量未正确加载**：Django 应用可能没有从正确的环境变量文件加载
2. **环境变量文件路径问题**：可能有多个环境变量文件，Django 加载的不是包含公钥ID的文件

## 诊断步骤

### 1. 检查环境变量是否正确加载

运行诊断脚本：

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env
python3 check_env_loading.py
```

### 2. 检查环境变量文件

确认 `WECHAT_PUBLIC_KEY_ID` 在正确的文件中：

```bash
# 检查系统环境变量文件
grep WECHAT_PUBLIC_KEY_ID /www/server/python_project/vhost/env/backend.env

# 检查项目 .env 文件
grep WECHAT_PUBLIC_KEY_ID /root/echo/backend/.env
```

### 3. 确保环境变量在 Django 启动时加载

如果使用 systemd 服务，检查服务配置文件：

```bash
# 查看服务配置
sudo systemctl cat gunicorn
# 或
cat /etc/systemd/system/gunicorn.service
```

确保服务配置中加载了正确的环境变量文件：

```ini
[Service]
EnvironmentFile=/www/server/python_project/vhost/env/backend.env
```

### 4. 临时解决方案：在 .env 文件中添加

如果系统环境变量文件没有被 Django 加载，可以在项目 `.env` 文件中添加：

```bash
# 编辑项目 .env 文件
nano /root/echo/backend/.env
```

添加：
```bash
WECHAT_PUBLIC_KEY_ID=PUB_KEY_ID_0111022734482025121100291855003000
```

### 5. 重启服务

修改后重启服务：

```bash
sudo systemctl restart gunicorn
```

### 6. 验证

运行诊断脚本，应该看到：

```
✅ 检测到公钥ID: PUB_KEY_ID_0111022734...
✅ 检测到 PUBLIC KEY 格式和公钥ID，使用微信支付公钥模式
✅ 使用微信支付公钥模式，公钥ID: PUB_KEY_ID_0111022734482025121100291855003000
```

## 快速修复

如果环境变量文件路径不确定，最简单的方法是在项目 `.env` 文件中添加：

```bash
echo "WECHAT_PUBLIC_KEY_ID=PUB_KEY_ID_0111022734482025121100291855003000" >> /root/echo/backend/.env
```

然后重启服务。

