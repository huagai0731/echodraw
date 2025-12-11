# 支付错误调试指南

## 问题现象

前端请求 `/api/payments/orders/create/` 返回 500 错误，响应是 HTML 格式而不是 JSON。

## 已完成的修复

1. ✅ 添加了自定义异常处理器，确保所有错误返回 JSON 格式
2. ✅ 改进了 `create_payment_order` 函数的错误处理
3. ✅ 添加了订单创建时的异常捕获

## 调试步骤

### 1. 查看服务器日志

在服务器上运行以下命令查看实时日志：

```bash
# 如果使用 systemd
sudo journalctl -u gunicorn -f

# 如果使用 supervisor
sudo supervisorctl tail -f echo

# 或者查看应用日志文件
tail -f /root/echo/backend/logs/*.log
```

### 2. 检查环境变量

确保 `ALIPAY_APPID` 已设置：

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env
python3 check_payment_config.py
```

### 3. 测试支付接口

使用 curl 测试接口（替换为实际的 token）：

```bash
curl -X POST https://echodraw.com/api/payments/orders/create/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token YOUR_TOKEN_HERE" \
  -d '{
    "payment_method": "alipay",
    "amount": 99.00,
    "tier": "premium",
    "expires_at": "2025-12-31"
  }'
```

### 4. 检查 Django 错误日志

查看 Django 的详细错误信息：

```bash
# 查看最近的错误
grep -i error /root/echo/backend/logs/*.log | tail -20

# 或者查看完整的异常堆栈
grep -A 50 "Traceback" /root/echo/backend/logs/*.log | tail -100
```

## 常见错误原因

### 1. 缺少 ALIPAY_APPID

**错误信息**：
```
ValueError: ALIPAY_APPID 环境变量未设置
```

**解决方法**：
在环境变量文件中添加：
```bash
ALIPAY_APPID=你的支付宝应用ID
```

### 2. 数据库连接错误

**错误信息**：
```
django.db.utils.OperationalError: ...
```

**解决方法**：
检查数据库配置和连接。

### 3. 支付模块初始化失败

**错误信息**：
```
ValueError: 支付配置错误: ...
```

**解决方法**：
运行 `python3 check_payment_config.py` 检查配置。

## 下一步

1. 重启 Django 服务以应用新的异常处理器
2. 再次测试支付功能
3. 查看日志获取详细错误信息
4. 根据日志中的具体错误进行修复

## 重启服务

```bash
# systemd
sudo systemctl restart gunicorn

# supervisor
sudo supervisorctl restart echo

# pm2
pm2 restart echo
```

