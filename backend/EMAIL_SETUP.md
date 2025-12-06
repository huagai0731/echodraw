# 邮箱配置说明

## 配置位置

邮箱配置通过环境变量设置，系统会按以下顺序加载配置文件：
1. `.env` - 基础配置
2. `.env.local` - 本地配置（通常不提交到Git）
3. `.env.development` - 开发环境配置（会覆盖前面的配置）

## 需要设置的环境变量

在 `backend` 目录下创建 `.env` 或 `.env.local` 文件，添加以下配置：

### 163邮箱配置示例

```env
# SMTP服务器配置
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USE_TLS=false

# 邮箱账号（你的163邮箱地址）
SMTP_USERNAME=your_email@163.com

# 邮箱授权码（不是登录密码！）
# 163邮箱需要在设置中开启SMTP服务并获取授权码
SMTP_PASSWORD=your_authorization_code

# 发件人邮箱（通常与SMTP_USERNAME相同）
SMTP_FROM_EMAIL=your_email@163.com

# 超时设置（秒）
SMTP_TIMEOUT=15
```

### 其他邮箱服务商配置

#### QQ邮箱
```env
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USE_TLS=false
SMTP_USERNAME=your_email@qq.com
SMTP_PASSWORD=your_authorization_code
SMTP_FROM_EMAIL=your_email@qq.com
```

#### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_SSL=false
SMTP_USE_TLS=true
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
```

#### 企业邮箱（以腾讯企业邮箱为例）
```env
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USE_TLS=false
SMTP_USERNAME=your_email@yourdomain.com
SMTP_PASSWORD=your_password
SMTP_FROM_EMAIL=your_email@yourdomain.com
```

## 如何获取163邮箱授权码

1. 登录163邮箱网页版
2. 进入"设置" -> "POP3/SMTP/IMAP"
3. 开启"POP3/SMTP服务"和"IMAP/SMTP服务"
4. 点击"生成授权码"
5. 按照提示发送短信验证
6. 获取授权码（通常是一串16位的字符）
7. 将授权码设置为 `SMTP_PASSWORD` 的值

**重要提示：**
- 授权码不是登录密码
- 授权码需要妥善保管，不要泄露
- 如果忘记授权码，可以重新生成

## 测试邮箱配置

配置完成后，重启Django服务器，然后尝试注册账号。如果配置正确，你应该能收到验证码邮件。

如果仍然收不到邮件，请检查：
1. 后端日志中是否有错误信息
2. 授权码是否正确
3. 是否开启了SMTP服务
4. 防火墙是否阻止了SMTP连接

## 开发环境快速测试

如果只是想在开发环境快速测试，可以使用控制台后端（不发送真实邮件）：

在 `.env.development` 中添加：
```env
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

这样邮件内容会直接输出到控制台，方便调试。

