#!/bin/bash
# 修复数据库后端结构（在云服务器上运行）

cd "$(dirname "$0")/core"

# 如果 db_backend.py 还存在，将其移动到包结构中
if [ -f "db_backend.py" ]; then
    echo "创建 db_backend 包结构..."
    mkdir -p db_backend
    mv db_backend.py db_backend/base.py
    
    # 创建 __init__.py（如果不存在）
    if [ ! -f "db_backend/__init__.py" ]; then
        cat > db_backend/__init__.py << 'EOF'
"""
自定义 MySQL 数据库后端包
"""
from .base import DatabaseWrapper

__all__ = ['DatabaseWrapper']
EOF
    fi
    
    echo "✓ 数据库后端结构已修复"
else
    echo "db_backend.py 不存在，可能已经修复"
fi








