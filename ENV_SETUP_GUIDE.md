# 环境变量配置指南

本文档说明如何设置 `DJANGO_SECRET_KEY` 和 `DJANGO_DEBUG` 等环境变量。

## 📍 设置位置

环境变量可以通过以下方式设置：

### 方法1：使用 .env 文件（推荐）

在 `backend` 目录下创建 `.env` 文件：

```bash
cd backend
cp .env.example .env
```

然后编辑 `.env` 文件，填入实际值。

**优点**：
- 方便管理
- 不同环境可以使用不同的 .env 文件
- 项目已配置自动加载 .env 文件

### 方法2：系统环境变量

在系统级别设置环境变量（根据操作系统不同）：

**Windows (PowerShell)**:
```powershell
$env:DJANGO_SECRET_KEY="your-secret-key"
$env:DJANGO_DEBUG="False"
```

**Windows (CMD)**:
```cmd
set DJANGO_SECRET_KEY=your-secret-key
set DJANGO_DEBUG=False
```

**Linux/Mac (Bash)**:
```bash
export DJANGO_SECRET_KEY="your-secret-key"
export DJANGO_DEBUG="False"
```

**永久设置（Linux/Mac）**:
编辑 `~/.bashrc` 或 `~/.zshrc`，添加：
```bash
export DJANGO_SECRET_KEY="your-secret-key"
export DJANGO_DEBUG="False"
```

## 🔑 必需的环境变量

### 1. DJANGO_SECRET_KEY（必需）

**生成密钥**:
```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

**设置方式**:
```bash
# .env 文件
DJANGO_SECRET_KEY=生成的密钥

# 或系统环境变量
export DJANGO_SECRET_KEY="生成的密钥"
```

### 2. DJANGO_DEBUG（必需）

**生产环境必须设置为 False**:
```bash
# .env 文件
DJANGO_DEBUG=False

# 或系统环境变量
export DJANGO_DEBUG="False"
```

### 3. DJANGO_ALLOWED_HOSTS（必需）

**设置允许的主机**:
```bash
# .env 文件
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# 或系统环境变量
export DJANGO_ALLOWED_HOSTS="yourdomain.com,www.yourdomain.com"
```

### 4. DJANGO_CORS_ALLOWED_ORIGINS（必需）

**设置CORS允许的源**:
```bash
# .env 文件
DJANGO_CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 或系统环境变量
export DJANGO_CORS_ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
```

## 🗄️ 数据库配置

### 本地开发（SQLite）

**不需要设置**，默认使用SQLite。

### 云服务器（MySQL）

设置以下环境变量：

```bash
# .env 文件
DJANGO_DB_ENGINE=mysql
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_HOST=localhost
DB_PORT=3306
```

**示例**:
```bash
DJANGO_DB_ENGINE=mysql
DB_NAME=echodraw_db
DB_USER=echodraw_user
DB_PASSWORD=your_secure_password
DB_HOST=localhost
DB_PORT=3306
```

## 📧 SMTP配置（如果使用邮件功能）

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USERNAME=your_email@example.com
SMTP_PASSWORD=your_email_password
SMTP_FROM_EMAIL=your_email@example.com
```

## 🔍 验证配置

运行配置检查脚本：

```bash
cd backend
python check_production_config.py
```

## 📝 不同环境的配置

### 本地开发环境

创建 `backend/.env.local` 文件：

```bash
DJANGO_SECRET_KEY=开发环境密钥（可以使用默认值）
DJANGO_DEBUG=True
DJANGO_ENVIRONMENT=development
# 不设置数据库配置，使用SQLite
```

### 云服务器生产环境

创建 `backend/.env` 文件：

```bash
DJANGO_SECRET_KEY=生产环境密钥（必须随机生成）
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DJANGO_CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# MySQL配置
DJANGO_DB_ENGINE=mysql
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_HOST=localhost
DB_PORT=3306

# SMTP配置
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USERNAME=your_email@example.com
SMTP_PASSWORD=your_email_password
```

## ⚠️ 安全提醒

1. **不要提交 .env 文件到版本控制系统**
   - `.env` 文件已在 `.gitignore` 中
   - 只提交 `.env.example` 作为模板

2. **生产环境密钥必须随机生成**
   - 不要使用默认密钥
   - 不要使用弱密钥

3. **保护 .env 文件权限**
   ```bash
   chmod 600 .env  # Linux/Mac
   ```

## 🚀 部署到云服务器

1. **在服务器上创建 .env 文件**:
   ```bash
   cd /path/to/your/project/backend
   nano .env
   ```

2. **填入生产环境配置**（参考上面的示例）

3. **验证配置**:
   ```bash
   python check_production_config.py
   ```

4. **重启服务**:
   ```bash
   # 如果使用systemd
   sudo systemctl restart your-service
   
   # 如果使用gunicorn
   # 重启gunicorn进程
   ```

## 📞 常见问题

### Q: 如何知道环境变量是否生效？

A: 运行配置检查脚本，或启动Django时会显示错误信息。

### Q: 本地和服务器可以使用不同的配置吗？

A: 可以。本地使用 `.env.local`，服务器使用 `.env`。

### Q: 忘记设置环境变量会怎样？

A: Django启动时会报错并提示需要设置哪些变量。

### Q: 可以在代码中硬编码吗？

A: 不推荐，特别是生产环境。使用环境变量更安全。

