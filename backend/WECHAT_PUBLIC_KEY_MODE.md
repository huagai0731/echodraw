# 微信支付公钥模式配置指南

## 概述

微信支付支持两种模式：
1. **平台证书模式**：自动获取和更新证书（推荐，但可能遇到签名验证问题）
2. **微信支付公钥模式**：使用固定的公钥和公钥ID（更稳定）

## 配置步骤

### 1. 下载微信支付公钥

1. 登录微信支付商户平台：https://pay.weixin.qq.com
2. 进入 "账户中心" -> "API安全" -> "微信支付公钥"
3. 下载公钥文件（.pem 格式）

### 2. 获取公钥ID

在下载公钥的页面，会显示公钥ID，格式类似：
```
PUB_KEY_ID_0111022734482025121100291855003000
```

### 3. 配置环境变量

在环境变量文件中添加：

```bash
# 微信支付公钥（从下载的文件中读取内容）
WECHAT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"

# 微信支付公钥ID（从商户平台获取）
WECHAT_PUBLIC_KEY_ID=PUB_KEY_ID_0111022734482025121100291855003000
```

或者使用文件路径：

```bash
# 微信支付公钥文件路径
WECHAT_PUBLIC_KEY_PATH=/root/echo/backend/wechatpay_public_key.pem

# 微信支付公钥ID
WECHAT_PUBLIC_KEY_ID=PUB_KEY_ID_0111022734482025121100291855003000
```

### 4. 上传公钥文件（如果使用文件路径）

```bash
# 将下载的公钥文件上传到服务器
scp wechatpay_public_key.pem root@your-server:/root/echo/backend/

# 设置文件权限
chmod 600 /root/echo/backend/wechatpay_public_key.pem
```

### 5. 验证配置

运行诊断脚本：

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env
python3 check_payment_config.py
```

应该看到：
```
✅ WECHAT_PUBLIC_KEY_ID = PUB_KEY_ID_0111022734482025121100291855003000
✅ 微信支付客户端初始化成功
```

### 6. 重启服务

```bash
sudo systemctl restart gunicorn
```

## 注意事项

1. **公钥ID必须正确**：公钥ID必须与商户平台显示的一致
2. **公钥格式**：必须是 PUBLIC KEY 格式，不是 CERTIFICATE 格式
3. **公钥更新**：如果微信支付更新了公钥，需要重新下载并更新配置

## 优势

使用公钥模式的优势：
- ✅ 更稳定：不需要自动获取证书，避免证书获取失败的问题
- ✅ 更简单：配置一次后不需要频繁更新
- ✅ 更可靠：避免签名验证失败的问题

## 故障排查

如果仍然遇到签名验证失败：

1. **检查公钥ID是否正确**：
   ```bash
   echo $WECHAT_PUBLIC_KEY_ID
   ```

2. **检查公钥格式**：
   ```bash
   cat /root/echo/backend/wechatpay_public_key.pem | head -1
   # 应该显示: -----BEGIN PUBLIC KEY-----
   ```

3. **查看日志**：
   ```bash
   tail -f /root/echo/backend/logs/*.log | grep -i "公钥\|public_key"
   ```

## 切换回平台证书模式

如果想切换回平台证书模式，只需：
1. 删除或注释掉 `WECHAT_PUBLIC_KEY_ID` 环境变量
2. 删除或注释掉 `WECHAT_PUBLIC_KEY` 或 `WECHAT_PUBLIC_KEY_PATH`
3. 重启服务

系统会自动切换到平台证书模式。

