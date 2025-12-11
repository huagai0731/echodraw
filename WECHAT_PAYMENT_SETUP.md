# 微信支付配置指南

本文档说明如何配置微信支付功能。

## 环境变量配置

在 `.env` 文件中添加以下环境变量：

### 必需配置

```bash
# 微信支付 AppID（小程序或公众号的 AppID）
WECHAT_APPID=你的微信AppID

# 微信支付商户号
WECHAT_MCHID=你的商户号

# 商户证书序列号（在微信支付商户平台获取）
WECHAT_CERT_SERIAL_NO=你的证书序列号

# 微信支付回调地址（支付完成后微信会调用此地址）
WECHAT_NOTIFY_URL=https://yourdomain.com/api/payments/wechat/notify/

# 微信支付平台公钥文件路径（用于验证回调签名）
WECHAT_PUBLIC_KEY_PATH=/path/to/wechatpay_public_key.pem
```

### 私钥配置（二选一）

**方式1：使用私钥文件路径（推荐）**

```bash
# 商户私钥文件路径
WECHAT_PRIVATE_KEY_PATH=/path/to/apiclient_key.pem
```

**方式2：使用私钥字符串（适用于容器化部署）**

```bash
# 商户私钥内容（完整的PEM格式，包含头尾）
WECHAT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
你的私钥内容
-----END PRIVATE KEY-----"
```

## 获取配置信息

### 1. 获取 AppID 和商户号

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com/)
2. 在"账户中心" -> "API安全"中查看：
   - **AppID**：在"开发配置"中查看
   - **商户号（MCHID）**：在账户信息中查看

### 2. 获取证书和密钥

1. 在微信支付商户平台，进入"账户中心" -> "API安全"
2. 下载以下文件：
   - **API证书**：包含 `apiclient_cert.pem` 和 `apiclient_key.pem`
   - **平台证书**：用于验证回调签名

3. 获取证书序列号：
   - 在"API安全" -> "API证书"中查看证书序列号
   - 或者使用以下命令查看：
     ```bash
     openssl x509 -in apiclient_cert.pem -noout -serial
     ```

### 3. 配置回调地址

1. 在微信支付商户平台，进入"产品中心" -> "开发配置"
2. 设置"支付授权目录"和"支付回调URL"
3. 回调URL格式：`https://yourdomain.com/api/payments/wechat/notify/`

## 安装依赖

确保已安装微信支付SDK：

```bash
pip install wechatpay-python>=1.2.0
pip install python-dateutil>=2.8.0
```

## 测试配置

可以使用以下Python脚本测试配置：

```python
# test_wechat_config.py
import os
from dotenv import load_dotenv

load_dotenv()

try:
    from core.payment.wechat import get_wechatpay_client
    client = get_wechatpay_client()
    print("✅ 微信支付配置正确")
except Exception as e:
    print(f"❌ 微信支付配置错误: {e}")
```

运行测试：

```bash
python test_wechat_config.py
```

## 注意事项

1. **私钥安全**：
   - 私钥文件应妥善保管，不要提交到代码仓库
   - 建议使用环境变量或密钥管理服务

2. **证书更新**：
   - 微信支付证书会定期更新，需要及时更新平台公钥
   - 证书序列号变更时需要更新 `WECHAT_CERT_SERIAL_NO`

3. **回调地址**：
   - 回调地址必须是HTTPS
   - 回调地址需要在微信支付商户平台配置
   - 确保服务器可以接收来自微信服务器的POST请求

4. **测试环境**：
   - 微信支付提供沙箱环境用于测试
   - 沙箱环境的配置与生产环境类似，但使用沙箱商户号

## 常见问题

### 1. 签名验证失败

- 检查证书序列号是否正确
- 检查平台公钥文件是否正确
- 确保私钥和证书匹配

### 2. 回调接收不到

- 检查回调URL是否正确配置
- 检查服务器防火墙设置
- 查看服务器日志确认是否收到请求

### 3. 二维码无法显示

- 检查前端是否正确获取 `code_url`
- 检查二维码生成服务是否可用
- 查看浏览器控制台错误信息

## 相关文档

- [微信支付开发文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [wechatpay-python SDK文档](https://github.com/wechatpay-apiv3/wechatpay-python)

