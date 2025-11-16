#!/bin/bash
# 快速部署脚本（仅构建前端）

cd ~/echo/frontend
npm run build

echo "✅ 构建完成！"
echo "现在需要："
echo "1. 重启 web 服务器（nginx/gunicorn 等）"
echo "2. 清除浏览器缓存"


