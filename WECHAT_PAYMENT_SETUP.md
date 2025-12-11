# 微信支付配置指南

本文档说明如何配置微信支付功能。支持两种支付方式：
- **Native支付**：扫码支付（适用于PC端或非微信浏览器）
- **JSAPI支付**：公众号内支付（适用于微信浏览器内，无需扫码）

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

### JSAPI支付配置（可选，用于公众号内支付）

如果要使用JSAPI支付（公众号内支付），还需要配置：

```bash
# 公众号的AppSecret（用于获取openid）
WECHAT_SECRET=你的公众号AppSecret
```

**前端环境变量**（在 `.env` 或 `.env.production` 中配置）：

```bash
# 微信AppID（用于前端生成授权URL）
# 注意：项目使用Vite，环境变量必须以 VITE_ 开头
VITE_WECHAT_APPID=你的微信AppID
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

### 4. 配置JSAPI支付（公众号内支付）

如果要使用JSAPI支付，还需要在公众号后台配置：

#### 步骤1：获取AppID和AppSecret

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入"开发" -> "基本配置"
3. 查看以下信息：
   - **AppID（应用ID）**：这是你的公众号唯一标识
     - 复制这个AppID，配置到环境变量 `WECHAT_APPID`（后端）和 `REACT_APP_WECHAT_APPID`（前端）
   - **AppSecret（应用密钥）**：
     - 如果还没有设置，点击"生成"按钮生成新的AppSecret
     - 如果已经设置但忘记了，可以点击"重置"按钮重置（注意：重置后旧的AppSecret会失效）
     - 复制AppSecret，配置到环境变量 `WECHAT_SECRET`（后端）

**重要提示**：
- AppSecret只显示一次，请务必妥善保存
- 如果忘记AppSecret，只能重置，重置后旧的AppSecret会失效
- AppSecret用于获取用户的openid，是JSAPI支付必需的

#### 步骤2：配置网页授权域名

**重要**：网页授权域名和JS接口安全域名是不同的配置项！

1. 在微信公众平台，进入 **"设置"** -> **"公众号设置"** -> **"功能设置"**
2. 找到 **"网页授权域名"** 配置项（不是"JS接口安全域名"）
3. 点击"设置"或"修改"，添加你的网站域名：
   - 格式：`yourdomain.com`（不需要加 `http://` 或 `https://`）
   - 不需要加端口号
   - 例如：`echodraw.com` 或 `www.echodraw.com`
4. 按照提示下载验证文件，上传到你的网站根目录进行验证
5. 验证通过后，域名配置生效

**注意**：
- 网页授权域名必须是已备案的域名（国内服务器）
- 域名配置后，只能通过该域名下的页面进行授权
- 如果需要支持多个域名，需要分别配置
- **网页授权域名**和**JS接口安全域名**是两个不同的配置，都需要配置（如果要用JS-SDK功能）

**配置位置对比**：
- **JS接口安全域名**：在"开发" -> "基本配置" -> "JS接口安全域名"
- **网页授权域名**：在"设置" -> "公众号设置" -> "功能设置" -> "网页授权域名"

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

### 4. JSAPI支付无法调起

- 检查是否在微信浏览器中打开（使用 `isWechatBrowser()` 检测）
- 检查是否配置了 `WECHAT_SECRET` 环境变量
- 检查公众号是否配置了网页授权域名
- 检查前端是否配置了 `REACT_APP_WECHAT_APPID`
- 查看浏览器控制台错误信息

### 5. 获取openid失败

- 检查 `WECHAT_SECRET` 是否正确
- 检查网页授权域名是否配置正确
- 检查授权回调URL是否正确编码
- 查看后端日志中的错误信息

## 支付方式说明

### Native支付（扫码支付）

- **适用场景**：PC端或非微信浏览器
- **用户体验**：显示二维码，用户使用微信扫码支付
- **限制**：不允许截图后扫码支付

### JSAPI支付（公众号内支付）

- **适用场景**：用户在微信浏览器中打开网页
- **用户体验**：点击支付按钮后直接调起微信支付，无需扫码
- **优势**：体验流畅，无需扫码
- **要求**：
  - 必须在微信浏览器中打开
  - 需要配置公众号网页授权域名
  - 需要获取用户的openid（通过微信授权）

## 相关文档

- [微信支付开发文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [wechatpay-python SDK文档](https://github.com/wechatpay-apiv3/wechatpay-python)

