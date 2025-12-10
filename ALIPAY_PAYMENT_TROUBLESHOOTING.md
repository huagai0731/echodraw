# 支付宝支付问题排查指南

## 问题描述

本地环境可以成功支付，但部署到云服务器后点击支付宝支付会返回 500 错误。

## 已修复的问题

### 1. Service Worker 缓存 POST 请求问题 ✅

**问题**：Service Worker 试图缓存所有请求，包括 POST 请求，但 Cache API 不支持缓存 POST 请求。

**错误信息**：
```
sw.js:40 Uncaught (in promise) TypeError: Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported
```

**修复**：已更新 `frontend/public/sw.js`，现在会：
- 跳过所有非 GET 请求（POST, PUT, DELETE 等）
- 跳过所有 API 请求（`/api/` 路径）
- 只缓存静态资源（HTML, CSS, JS, 图片等）

**注意**：修复后需要重新构建前端并部署：
```bash
cd frontend
npm run build
```

## 后端 500 错误排查

### 检查清单

#### 1. 环境变量配置

确保以下环境变量已正确设置：

```bash
# 必需的环境变量
ALIPAY_APPID=你的支付宝应用ID
ALIPAY_PRIVATE_KEY=你的应用私钥
ALIPAY_PUBLIC_KEY=支付宝公钥
ALIPAY_NOTIFY_URL=https://echodraw.com/api/payments/alipay/notify/
ALIPAY_RETURN_URL=https://echodraw.com/（可选）

# 可选配置
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do  # 生产环境
# 或
ALIPAY_GATEWAY=https://openapi.alipaydev.com/gateway.do  # 沙箱环境
ALIPAY_SIGN_TYPE=RSA2  # 默认 RSA2
ALIPAY_DEBUG=False  # 生产环境应为 False
```

#### 2. 检查环境变量是否加载

在服务器上检查环境变量：

```bash
# 如果使用 systemd 服务
systemctl show-environment | grep ALIPAY

# 如果使用 .env 文件
cat /path/to/your/.env | grep ALIPAY
```

**快速检查脚本**：

我们提供了一个配置检查脚本，可以快速检查所有支付宝配置：

```bash
cd backend
python check_alipay_config.py
```

这个脚本会：
- 检查所有必需和可选的环境变量
- 尝试创建支付宝客户端
- 测试网络连接到支付宝网关
- 显示详细的配置信息

#### 3. 检查密钥格式

支付宝密钥应该是完整的 RSA 密钥，包含头尾：

```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
（密钥内容，每64字符一行）
...
-----END RSA PRIVATE KEY-----
```

如果环境变量中的密钥没有头尾，代码会自动添加，但建议直接使用完整格式。

#### 4. 检查网络连接

确保服务器可以访问支付宝网关：

```bash
# 测试生产环境网关
curl -I https://openapi.alipay.com/gateway.do

# 测试沙箱环境网关
curl -I https://openapi.alipaydev.com/gateway.do
```

#### 5. 查看后端日志

查看 Django 日志文件，查找详细的错误信息：

```bash
# 如果使用 systemd
journalctl -u your-django-service -f

# 如果使用 supervisor
tail -f /var/log/supervisor/django-stdout.log
tail -f /var/log/supervisor/django-stderr.log

# 如果使用 gunicorn/uwsgi
tail -f /var/log/gunicorn/error.log
```

查找包含以下关键字的日志：
- `创建支付宝支付失败`
- `ALIPAY_APPID 环境变量未设置`
- `ALIPAY_PRIVATE_KEY 环境变量未设置`
- `ALIPAY_PUBLIC_KEY 环境变量未设置`

#### 6. 测试支付宝配置

可以在 Django shell 中测试配置：

```bash
cd backend
python manage.py shell
```

```python
from core.payment.alipay import get_alipay_client

try:
    alipay = get_alipay_client()
    print("✅ 支付宝配置正确")
except Exception as e:
    print(f"❌ 支付宝配置错误: {e}")
```

## 常见错误及解决方案

### 错误 1: 环境变量未设置

**错误信息**：`ALIPAY_APPID 环境变量未设置`

**解决方案**：
1. 检查环境变量是否正确设置
2. 确保在启动 Django 服务前加载环境变量
3. 如果使用 systemd，在服务文件中设置 `EnvironmentFile`

### 错误 2: 密钥格式错误

**错误信息**：`Invalid key format` 或类似的密钥解析错误

**解决方案**：
1. 确保密钥是完整的 RSA 密钥
2. 检查密钥中是否有特殊字符被转义
3. 如果使用环境变量，确保正确转义换行符（使用 `\n`）

### 错误 3: 网络连接失败

**错误信息**：`Connection timeout` 或 `Network unreachable`

**解决方案**：
1. 检查服务器防火墙设置
2. 确保服务器可以访问外网
3. 检查 DNS 解析是否正常

### 错误 4: 应用 ID 或密钥不匹配

**错误信息**：支付宝返回签名验证失败

**解决方案**：
1. 确认使用的是正确的应用 ID
2. 确认私钥和公钥匹配
3. 检查是否混淆了沙箱和生产环境的配置

## 调试步骤

1. **重新构建并部署前端**
   ```bash
   cd frontend
   npm run build
   # 部署 dist 目录到服务器
   ```

2. **检查后端日志**
   - 查看最新的错误日志
   - 确认错误发生的具体位置

3. **测试支付宝配置**
   - 在 Django shell 中测试 `get_alipay_client()`
   - 确认所有环境变量都已加载

4. **验证网络连接**
   - 测试服务器到支付宝网关的连接
   - 检查防火墙和代理设置

5. **检查权限**
   - 确保 Django 进程有权限读取环境变量
   - 确保日志文件有写入权限

## 联系支持

如果问题仍然存在，请提供以下信息：

1. 后端错误日志（包含完整堆栈跟踪）
2. 环境变量配置（隐藏敏感信息）
3. 服务器环境信息（操作系统、Python 版本、Django 版本）
4. 部署方式（systemd、supervisor、docker 等）

