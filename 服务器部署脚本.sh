#!/bin/bash
# 服务器前端构建和部署脚本

echo "🚀 开始部署前端..."

# 进入项目目录
cd ~/echo

# 1. 拉取最新代码
echo "📥 拉取最新代码..."
git pull

# 2. 进入前端目录
cd frontend

# 3. 安装依赖（如果有新包）
echo "📦 检查依赖..."
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "安装/更新依赖..."
    npm install
fi

# 4. 构建前端
echo "🔨 构建前端..."
npm run build

# 5. 检查构建是否成功
if [ ! -d "dist" ]; then
    echo "❌ 构建失败！dist 目录不存在"
    exit 1
fi

echo "✅ 前端构建完成！"

# 6. 如果使用 Django 服务静态文件，需要收集静态文件
cd ../backend
echo "📋 收集 Django 静态文件..."
python manage.py collectstatic --noinput

# 7. 重启服务（根据你的部署方式选择）
echo "🔄 重启服务..."

# 如果使用 systemd 服务
# sudo systemctl restart your-django-service

# 如果使用 supervisor
# sudo supervisorctl restart echo

# 如果使用 gunicorn + nginx
# 需要重启 gunicorn 进程
# pkill -f gunicorn
# 然后重新启动 gunicorn

# 如果使用 PM2
# pm2 restart echo

echo "✅ 部署完成！"
echo ""
echo "💡 提示："
echo "1. 清除浏览器缓存（Ctrl+Shift+R 或 Cmd+Shift+R）"
echo "2. 检查前端构建产物：ls -la frontend/dist/"
echo "3. 检查服务器日志确认服务已重启"


