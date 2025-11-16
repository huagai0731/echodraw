#!/bin/bash
# 快速升级 Node.js 到 20.x（使用 nvm）

echo "📦 安装 nvm..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

echo "📥 安装 Node.js 20..."
nvm install 20
nvm use 20
nvm alias default 20

echo "✅ 完成！当前版本："
node -v
npm -v

echo ""
echo "💡 提示：如果新开终端，需要执行："
echo "   export NVM_DIR=\"\$HOME/.nvm\""
echo "   [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\""


