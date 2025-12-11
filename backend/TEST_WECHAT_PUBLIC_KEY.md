# 测试微信支付公钥模式

## 当前状态

✅ 环境变量已正确加载：
- `WECHAT_PUBLIC_KEY_ID = PUB_KEY_ID_0111022734482025121100291855003000`
- 在支付模块中可以正确读取

## 问题

代码仍然使用平台证书模式，而不是公钥模式。

## 可能的原因

1. **WECHAT_CERT_DIR 配置**：如果设置了 `WECHAT_CERT_DIR`，代码会先检查证书目录
2. **代码执行顺序**：代码逻辑可能没有正确检查公钥ID

## 解决方案

### 1. 临时禁用 WECHAT_CERT_DIR

如果不需要使用证书目录，可以注释掉或删除：

```bash
# 编辑环境变量文件
nano /root/echo/backend/.env
# 或
nano /www/server/python_project/vhost/env/backend.env
```

注释掉或删除：
```bash
# WECHAT_CERT_DIR=/root/echo/backend/wechatpay_certs
```

### 2. 重启服务并查看日志

```bash
# 重启服务
sudo systemctl restart gunicorn

# 查看日志
tail -f /root/echo/backend/logs/*.log | grep -i "公钥\|public_key\|cert_dir"
```

应该看到：
```
✅ 检测到公钥ID: PUB_KEY_ID_0111022734...
✅ 检测到 PUBLIC KEY 格式和公钥ID，使用微信支付公钥模式
✅ 已设置 public_key，长度: XXX 字符
✅ 使用微信支付公钥模式，公钥ID: PUB_KEY_ID_0111022734482025121100291855003000
```

### 3. 如果仍然使用证书模式

检查日志中的详细信息，看看为什么没有使用公钥模式。

## 验证

重启服务后，再次运行诊断脚本：

```bash
python3 check_payment_config.py
```

应该看到使用公钥模式的日志。

