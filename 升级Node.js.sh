#!/bin/bash
# 升级 Node.js 到 20.x 版本

echo "🔍 检查当前 Node.js 版本..."
node -v
npm -v

echo ""
echo "选择升级方式："
echo "1. 使用 nvm (Node Version Manager) - 推荐"
echo "2. 使用 NodeSource 仓库安装"
echo "3. 使用 n (Node.js 版本管理工具)"
read -p "请选择 (1/2/3): " choice

case $choice in
    1)
        echo "📦 安装 nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        
        # 加载 nvm
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        
        echo "📥 安装 Node.js 20.x..."
        nvm install 20
        nvm use 20
        nvm alias default 20
        
        echo "✅ 安装完成！"
        node -v
        ;;
    2)
        echo "📦 使用 NodeSource 安装 Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        
        echo "✅ 安装完成！"
        node -v
        ;;
    3)
        echo "📦 安装 n..."
        sudo npm install -g n
        sudo n 20
        
        echo "✅ 安装完成！"
        node -v
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "🔄 现在可以重新执行："
echo "   cd ~/echo/frontend"
echo "   npm install"
echo "   npm run build"


