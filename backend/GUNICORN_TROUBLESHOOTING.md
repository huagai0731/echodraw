# Gunicorn 启动问题排查指南

## 常见错误：Worker failed to boot

这个错误通常表示工作进程在启动时遇到了问题。以下是常见原因和解决方法：

## 快速诊断步骤

### 1. 运行诊断脚本

```bash
cd backend
python check_gunicorn.py
```

这个脚本会检查：
- Python 版本
- 环境变量配置
- Django 设置加载
- WSGI 应用导入
- 依赖包安装

### 2. 检查环境变量

**必须设置的环境变量：**

```bash
# 设置 Django Secret Key（生产环境必须）
export DJANGO_SECRET_KEY='your-very-long-random-secret-key-at-least-50-characters'

# 设置允许的主机（生产环境必须）
export DJANGO_ALLOWED_HOSTS='your-domain.com,www.your-domain.com,127.0.0.1'

# 设置环境类型（可选，但建议设置）
export ENVIRONMENT='production'  # 或 'development', 'local'
```

**检查当前环境变量：**

```bash
echo $DJANGO_SECRET_KEY
echo $DJANGO_ALLOWED_HOSTS
echo $ENVIRONMENT
```

### 3. 检查 .env 文件

确保在 `backend/` 目录下有 `.env` 文件，并包含必要的配置：

```bash
cd backend
ls -la .env
cat .env  # 查看内容（注意不要泄露敏感信息）
```

`.env` 文件示例：

```env
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_ALLOWED_HOSTS=your-domain.com,127.0.0.1
DJANGO_DEBUG=false
ENVIRONMENT=production
```

### 4. 检查虚拟环境

确保已激活虚拟环境并安装了所有依赖：

```bash
# 激活虚拟环境
source .venv/bin/activate  # 或 source venv/bin/activate

# 检查 gunicorn 是否安装
pip list | grep gunicorn

# 如果未安装，安装依赖
pip install -r requirements.txt
```

### 5. 测试 Django 设置

```bash
cd backend
python manage.py check
python manage.py check --deploy
```

### 6. 测试 WSGI 应用导入

```bash
cd backend
python -c "from config.wsgi import application; print('WSGI OK')"
```

## 常见问题及解决方案

### 问题 1: SECRET_KEY 未设置

**错误信息：**
```
ValueError: SECRET_KEY未设置！生产环境必须设置DJANGO_SECRET_KEY环境变量。
```

**解决方法：**

```bash
# 生成一个安全的 Secret Key
python -c "import secrets; print(secrets.token_urlsafe(50))"

# 设置环境变量
export DJANGO_SECRET_KEY='生成的密钥'

# 或添加到 .env 文件
echo "DJANGO_SECRET_KEY=生成的密钥" >> backend/.env
```

### 问题 2: DEBUG 模式导致的问题

**解决方法：**

```bash
# 生产环境必须关闭 DEBUG
export DJANGO_DEBUG=false
```

### 问题 3: 数据库连接问题

**检查数据库配置：**

```bash
python manage.py dbshell  # 测试数据库连接
python manage.py migrate  # 运行迁移
```

### 问题 4: 依赖包缺失

**解决方法：**

```bash
# 重新安装依赖
pip install -r requirements.txt

# 特别检查 gunicorn
pip install gunicorn
```

### 问题 5: 工作目录错误

**解决方法：**

确保在正确的目录下启动：

```bash
cd /path/to/echo/backend
# 然后启动 gunicorn
```

## 使用提供的启动脚本

### 方式 1: 使用标准启动脚本

```bash
cd backend
chmod +x start_gunicorn.sh
./start_gunicorn.sh
```

### 方式 2: 使用调试模式（推荐首次启动）

```bash
cd backend
chmod +x start_gunicorn_debug.sh
./start_gunicorn_debug.sh
```

调试模式会：
- 使用单进程（便于查看错误）
- 输出详细日志
- 显示所有错误信息

## 手动启动 Gunicorn

如果脚本不工作，可以手动启动：

```bash
cd backend

# 激活虚拟环境
source .venv/bin/activate

# 设置环境变量
export DJANGO_SETTINGS_MODULE=config.settings
export DJANGO_SECRET_KEY='your-secret-key'
export DJANGO_ALLOWED_HOSTS='your-domain.com,127.0.0.1'

# 启动 Gunicorn
gunicorn \
    --workers 4 \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    config.wsgi:application
```

## 查看详细错误日志

如果启动失败，查看错误日志：

```bash
# 使用调试模式查看详细错误
./start_gunicorn_debug.sh

# 或直接运行 Python 检查
python check_gunicorn.py
```

## 系统服务配置（systemd）

如果使用 systemd 管理服务，确保服务文件中的环境变量正确设置：

```ini
[Service]
Environment="DJANGO_SECRET_KEY=your-secret-key"
Environment="DJANGO_ALLOWED_HOSTS=your-domain.com"
Environment="DJANGO_DEBUG=false"
Environment="ENVIRONMENT=production"
WorkingDirectory=/path/to/echo/backend
```

## 检查清单

在启动 Gunicorn 前，确保：

- [ ] 虚拟环境已激活
- [ ] 所有依赖已安装（`pip install -r requirements.txt`）
- [ ] `DJANGO_SECRET_KEY` 已设置
- [ ] `DJANGO_ALLOWED_HOSTS` 已设置（生产环境）
- [ ] `.env` 文件存在且配置正确
- [ ] 数据库连接正常
- [ ] Django 迁移已运行（`python manage.py migrate`）
- [ ] 工作目录正确（在 `backend/` 目录下）

## 获取帮助

如果问题仍然存在：

1. 运行诊断脚本：`python check_gunicorn.py`
2. 查看详细错误：`./start_gunicorn_debug.sh`
3. 检查系统日志：`journalctl -u your-service-name -n 50`
4. 检查 Django 日志：`tail -f backend/logs/django.log`








