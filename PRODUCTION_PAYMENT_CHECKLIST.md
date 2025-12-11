# 生产环境支付功能检查清单

## ✅ 功能完整性检查

### 支付宝支付
- ✅ 创建支付订单接口
- ✅ 支付回调处理
- ✅ 签名验证
- ✅ 订单状态查询
- ✅ 会员状态同步

### 微信支付
- ✅ 创建支付订单接口
- ✅ 支付回调处理
- ✅ 签名验证
- ✅ 订单状态查询
- ✅ 会员状态同步

### 前端功能
- ✅ 用户可以选择支付宝或微信支付
- ✅ 支付二维码显示
- ✅ 支付状态轮询
- ✅ 支付成功提示

## 🔒 安全性检查

### 已实现的安全措施
- ✅ **签名验证**：支付宝和微信支付回调都进行签名验证
- ✅ **重复支付防护**：检查订单是否已支付，避免重复处理
- ✅ **重复订单防护**：5分钟内相同订单会返回已有订单
- ✅ **幂等性处理**：即使回调重复，也不会重复更新会员状态
- ✅ **CSRF豁免**：支付回调接口正确配置了CSRF豁免（第三方回调需要）
- ✅ **错误信息保护**：生产环境不暴露详细错误信息

### 需要配置的安全设置
- ⚠️ **HTTPS**：回调URL必须是HTTPS
- ⚠️ **环境变量**：所有敏感信息通过环境变量配置
- ⚠️ **密钥管理**：私钥和证书妥善保管，不要提交到代码仓库

## 📋 生产环境配置清单

### Django基础配置
```bash
# 必需配置
DJANGO_SECRET_KEY=你的密钥（使用 secrets.token_urlsafe(50) 生成）
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# 数据库配置（生产环境建议使用MySQL或PostgreSQL）
DJANGO_DB_ENGINE=mysql  # 或 postgresql
DB_NAME=你的数据库名
DB_USER=你的数据库用户
DB_PASSWORD=你的数据库密码
DB_HOST=数据库主机
DB_PORT=3306  # MySQL默认端口，PostgreSQL是5432
```

### 支付宝配置
```bash
# 必需配置
ALIPAY_APPID=你的支付宝AppID
ALIPAY_PRIVATE_KEY=你的商户私钥（完整PEM格式）
ALIPAY_PUBLIC_KEY=支付宝公钥（完整PEM格式）
ALIPAY_NOTIFY_URL=https://yourdomain.com/api/payments/alipay/notify/
ALIPAY_RETURN_URL=https://yourdomain.com/payment/success/  # 可选
ALIPAY_SIGN_TYPE=RSA2  # 默认RSA2
ALIPAY_DEBUG=False  # 生产环境必须为False

# 网关配置（生产环境）
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
```

### 微信支付配置
```bash
# 必需配置
WECHAT_APPID=你的微信AppID
WECHAT_MCHID=你的商户号
WECHAT_CERT_SERIAL_NO=你的证书序列号
WECHAT_APIV3_KEY=你的APIv3密钥
WECHAT_NOTIFY_URL=https://yourdomain.com/api/payments/wechat/notify/

# 私钥配置（二选一）
# 方式1：使用文件路径
WECHAT_PRIVATE_KEY_PATH=/path/to/apiclient_key.pem

# 方式2：使用私钥字符串（推荐用于容器化部署）
WECHAT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
你的私钥内容
-----END PRIVATE KEY-----"

# 平台证书配置（推荐使用自动获取模式，无需手动配置）
# 系统会自动从微信支付API获取证书
```

## 🧪 测试步骤

### 1. 配置验证测试
```bash
# 测试支付宝配置
cd backend
python -c "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); import django; django.setup(); from core.payment.alipay import get_alipay_client; client = get_alipay_client(); print('✅ 支付宝配置正确')"

# 测试微信支付配置
python -c "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); import django; django.setup(); from core.payment.wechat import get_wechatpay_client; client = get_wechatpay_client(); print('✅ 微信支付配置正确')"
```

### 2. 功能测试
1. **创建订单测试**
   - 测试支付宝订单创建
   - 测试微信支付订单创建
   - 测试重复订单创建（应返回已有订单）

2. **支付流程测试**
   - 支付宝：完成支付流程，验证回调
   - 微信支付：完成支付流程，验证回调
   - 验证会员状态是否正确更新

3. **异常情况测试**
   - 测试重复回调（应幂等处理）
   - 测试无效签名（应拒绝）
   - 测试订单不存在（应正确处理）

## ⚠️ 生产环境注意事项

### 1. 回调URL配置
- **支付宝**：在支付宝商户平台配置回调URL
  - 路径：`https://yourdomain.com/api/payments/alipay/notify/`
  - 必须是HTTPS
  - 确保服务器可以接收POST请求

- **微信支付**：在微信支付商户平台配置回调URL
  - 路径：`https://yourdomain.com/api/payments/wechat/notify/`
  - 必须是HTTPS
  - 确保服务器可以接收POST请求

### 2. 证书和密钥管理
- ✅ 私钥和证书不要提交到代码仓库
- ✅ 使用环境变量或密钥管理服务
- ✅ 定期更新证书（微信支付证书会定期更新）
- ✅ 备份密钥和证书（安全存储）

### 3. 监控和日志
- ✅ 配置日志记录（支付相关操作都有日志）
- ✅ 监控支付成功率
- ✅ 监控回调处理情况
- ✅ 设置异常告警

### 4. 数据库
- ✅ 生产环境使用MySQL或PostgreSQL（不要使用SQLite）
- ✅ 配置数据库连接池
- ✅ 定期备份数据库

### 5. 性能优化
- ✅ 配置数据库连接复用（已配置 `CONN_MAX_AGE=600`）
- ✅ 使用CDN加速静态资源
- ✅ 配置适当的缓存策略

## 🚀 部署前检查

- [ ] 所有环境变量已正确配置
- [ ] 回调URL已配置（支付宝和微信支付商户平台）
- [ ] HTTPS证书已配置
- [ ] 数据库已迁移到最新版本
- [ ] 日志配置已设置
- [ ] 监控告警已配置
- [ ] 已进行功能测试
- [ ] 已进行安全测试
- [ ] 备份策略已制定

## 📝 总结

### ✅ 可以用于生产环境

支付功能已经具备生产环境所需的基本要求：

1. **功能完整**：支付宝和微信支付都已完整实现
2. **安全可靠**：有签名验证、重复支付防护、幂等性处理
3. **错误处理**：完善的异常处理和日志记录
4. **用户友好**：用户可以选择支付方式，有清晰的支付流程

### ⚠️ 部署前必须完成

1. **配置环境变量**：所有必需的环境变量必须配置
2. **配置回调URL**：在支付宝和微信支付商户平台配置回调地址
3. **启用HTTPS**：回调URL必须是HTTPS
4. **测试验证**：进行完整的功能测试和安全测试

### 💡 建议

1. **使用沙箱环境测试**：在正式上线前，使用支付宝和微信支付的沙箱环境进行完整测试
2. **监控支付流程**：设置监控，及时发现和处理支付异常
3. **定期检查证书**：微信支付证书会定期更新，需要及时更新配置
4. **备份重要数据**：定期备份订单数据和用户会员状态

