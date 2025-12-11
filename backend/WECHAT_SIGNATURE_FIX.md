# 微信支付签名验证失败修复指南

## 问题描述

错误信息：
```
failed to verify the signature
```

这表明微信支付 API 返回的响应签名验证失败。

## 可能的原因

1. **证书获取失败**：无法从微信支付 API 获取平台证书
2. **证书过期**：已获取的证书已过期
3. **网络问题**：无法连接到微信支付 API
4. **配置错误**：商户私钥或证书序列号配置错误

## 解决方案

### 1. 检查证书配置

运行诊断脚本：

```bash
cd /root/echo/backend
source /www/server/python_project/vhost/env/backend.env
python3 check_payment_config.py
```

### 2. 检查证书目录权限

```bash
# 确保证书目录存在且可写
ls -la /root/echo/backend/wechatpay_certs_auto
chmod 755 /root/echo/backend/wechatpay_certs_auto
```

### 3. 手动下载平台证书

如果自动获取证书失败，可以手动下载：

1. 登录微信支付商户平台
2. 进入 "API安全" -> "平台证书"
3. 下载最新的平台证书（CERTIFICATE 格式）
4. 保存到 `/root/echo/backend/wechatpay_certs_auto/` 目录

### 4. 检查网络连接

确保服务器可以访问微信支付 API：

```bash
# 测试连接
curl -I https://api.mch.weixin.qq.com
```

### 5. 验证证书序列号

确保 `WECHAT_CERT_SERIAL_NO` 环境变量与商户平台中的证书序列号一致。

### 6. 检查日志

查看详细的错误日志：

```bash
# 查看 Django 日志
tail -f /root/echo/backend/logs/*.log | grep -i wechat
```

## 临时解决方案（仅用于调试）

如果急需测试，代码中已添加了临时禁用证书验证的逻辑（仅用于调试，生产环境不推荐）。

## 长期解决方案

1. **使用正确的证书格式**：确保使用 CERTIFICATE 格式的证书，不是 PUBLIC KEY
2. **定期更新证书**：微信支付平台证书会定期更新，需要及时更新
3. **监控证书状态**：添加监控，在证书即将过期时提醒

## 验证修复

修复后，再次测试微信支付：

1. 创建支付订单
2. 检查日志中是否有证书获取成功的消息
3. 确认支付流程正常

