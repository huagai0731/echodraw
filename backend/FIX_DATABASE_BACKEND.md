# 修复数据库后端配置

## 问题

Gunicorn 启动失败，错误信息：
```
'core.db_backend' isn't an available database backend or couldn't be imported.
ModuleNotFoundError: No module named 'core.db_backend.base'
```

## 原因

`core.db_backend` 是一个模块文件（`db_backend.py`），但 Django 期望数据库后端是一个包（包含 `base.py` 的目录）。

## 解决方案

### 方法 1: 在云服务器上运行修复脚本（推荐）

```bash
cd ~/echo/backend
chmod +x fix_db_backend.sh
./fix_db_backend.sh
```

### 方法 2: 手动修复

```bash
cd ~/echo/backend/core

# 创建包目录
mkdir -p db_backend

# 移动文件
mv db_backend.py db_backend/base.py

# 创建 __init__.py
cat > db_backend/__init__.py << 'EOF'
"""
自定义 MySQL 数据库后端包
"""
from .base import DatabaseWrapper

__all__ = ['DatabaseWrapper']
EOF
```

### 方法 3: 使用标准 MySQL 后端（如果不需要兼容 MySQL 5.7）

如果不需要兼容 MySQL 5.7，可以直接使用标准的 Django MySQL 后端。

在 `.env` 文件中设置：
```env
MYSQL_USE_CUSTOM_BACKEND=false
```

或者修改 `settings.py`，将 `MYSQL_USE_CUSTOM_BACKEND` 的默认值改为 `false`。

## 验证修复

修复后，运行诊断脚本：

```bash
cd ~/echo/backend
python3 check_gunicorn.py
```

应该不再出现数据库后端相关的错误。

## 文件结构

修复后的结构应该是：

```
backend/core/
├── db_backend/
│   ├── __init__.py
│   └── base.py
└── ...
```








