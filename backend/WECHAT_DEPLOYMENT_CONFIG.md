# 微信支付密钥路径配置指南（云服务器部署）

## 📍 路径配置

在云服务器上部署时，需要使用 **Linux 绝对路径**，而不是 Windows 路径。

### ✅ 正确的配置方式

在云服务器的 `.env` 文件中（位于 `/root/echo/backend/.env`），设置：

```bash
# 微信支付密钥路径（Linux 路径格式）
WECHAT_PUBLIC_KEY_PATH=/root/echo/backend/pub_key.pem
WECHAT_PRIVATE_KEY_PATH=/root/echo/backend/apiclient_key.pem
```

### ❌ 错误的配置方式

不要使用 Windows 路径格式：
```bash
# ❌ 错误：Windows 路径格式
WECHAT_PUBLIC_KEY_PATH=C:/Users/gai/Desktop/echo/backend/pub_key.pem
WECHAT_PRIVATE_KEY_PATH=C:/Users/gai/Desktop/echo/backend/apiclient_key.pem
```

## 📋 部署步骤

### 1. 上传密钥文件到服务器

确保以下文件已上传到服务器：
- `/root/echo/backend/pub_key.pem`（微信支付平台公钥）
- `/root/echo/backend/apiclient_key.pem`（商户私钥）

### 2. 检查文件权限

确保文件可读（建议权限 600，仅所有者可读写）：

```bash
cd /root/echo/backend
chmod 600 pub_key.pem
chmod 600 apiclient_key.pem
```

### 3. 配置环境变量

编辑 `.env` 文件：

```bash
cd /root/echo/backend
nano .env
```

添加或修改以下行：

```bash
WECHAT_PUBLIC_KEY_PATH=/root/echo/backend/pub_key.pem
WECHAT_PRIVATE_KEY_PATH=/root/echo/backend/apiclient_key.pem
```

### 4. 验证配置

运行检查脚本验证配置：

```bash
cd /root/echo/backend
python test_wechat_config.py
```

或使用：

```bash
python check_all_wechat_config.py
```

### 5. 重启服务

配置修改后，重启 Django 服务：

```bash
# 如果使用 systemd
sudo systemctl restart gunicorn

# 如果使用 supervisor
sudo supervisorctl restart echo

# 如果使用 pm2
pm2 restart echo

# 如果直接运行
# 停止当前进程后重新启动
```

## 🔄 替代方案：使用环境变量直接存储密钥内容

如果不想使用文件路径，也可以直接将密钥内容存储在环境变量中（适用于容器化部署）：

```bash
# 在 .env 文件中
WECHAT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"

WECHAT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"
```

**注意**：使用这种方式时，不要同时设置 `WECHAT_PRIVATE_KEY_PATH` 和 `WECHAT_PUBLIC_KEY_PATH`。

## 📝 路径说明

- **开发环境（Windows）**：`C:/Users/gai/Desktop/echo/backend/pub_key.pem`
- **生产环境（Linux）**：`/root/echo/backend/pub_key.pem`

代码会自动检测文件是否存在，优先使用文件路径，如果文件不存在则尝试从环境变量读取密钥内容。

## 🔍 故障排查

### 问题：找不到密钥文件

**错误信息**：
```
ValueError: 必须设置 WECHAT_PRIVATE_KEY_PATH 或 WECHAT_PRIVATE_KEY 环境变量
```

**解决方法**：
1. 检查文件是否存在：`ls -la /root/echo/backend/pub_key.pem`
2. 检查路径是否正确：`cat /root/echo/backend/.env | grep WECHAT`
3. 检查文件权限：`chmod 600 /root/echo/backend/*.pem`

### 问题：权限被拒绝

**错误信息**：
```
PermissionError: [Errno 13] Permission denied
```

**解决方法**：
```bash
chmod 600 /root/echo/backend/pub_key.pem
chmod 600 /root/echo/backend/apiclient_key.pem
```

### 问题：路径格式错误

**错误信息**：
```
FileNotFoundError: [Errno 2] No such file or directory
```

**解决方法**：
- 确保使用 Linux 路径格式（`/root/...`），而不是 Windows 格式（`C:/...`）
- 确保路径中的目录都存在

## 📚 相关文件

- `backend/core/payment/wechat.py` - 微信支付客户端实现
- `backend/test_wechat_config.py` - 配置检查脚本
- `backend/check_all_wechat_config.py` - 完整配置检查

