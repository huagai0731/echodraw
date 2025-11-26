#!/bin/bash
# 彻底删除 .git 并重新初始化，手动添加文件

echo "========================================"
echo "彻底删除并重建 Git 仓库"
echo "========================================"
echo ""

# 1. 完全删除 .git
echo "步骤 1: 删除 .git 目录..."
rm -rf .git
echo "✓ 已删除"
echo ""

# 2. 重新初始化
echo "步骤 2: 重新初始化 Git..."
git init
echo "✓ 已初始化"
echo ""

# 3. 显示要添加的文件
echo "步骤 3: 准备添加文件..."
echo "将添加以下内容（排除大文件）:"
echo "  - frontend/src/"
echo "  - frontend/package*.json"
echo "  - frontend/tsconfig*.json"
echo "  - frontend/vite.config.ts"
echo "  - frontend/index.html"
echo "  - frontend/eslint.config.js"
echo "  - backend/core/"
echo "  - backend/config/"
echo "  - backend/manage.py"
echo "  - backend/requirements.txt"
echo "  - .gitignore"
echo "  - 所有 .md, .sh, .bat, .ps1 文件"
echo ""
echo "不会添加:"
echo "  ✗ backend/db.sqlite3"
echo "  ✗ echodraw-master/"
echo "  ✗ frontend/dist/"
echo "  ✗ backend/media/"
echo "  ✗ backend/logs/"
echo "  ✗ *.ttf, *.woff, *.woff2"
echo "  ✗ *.jpg, *.png, *.webp"
echo ""

read -p "按 Enter 继续，或 Ctrl+C 取消..."

# 4. 添加文件
echo ""
echo "步骤 4: 添加文件..."
git add frontend/src/ 2>/dev/null && echo "✓ frontend/src/"
git add frontend/package*.json 2>/dev/null && echo "✓ frontend/package*.json"
git add frontend/tsconfig*.json 2>/dev/null && echo "✓ frontend/tsconfig*.json"
git add frontend/vite.config.ts 2>/dev/null && echo "✓ frontend/vite.config.ts"
git add frontend/index.html 2>/dev/null && echo "✓ frontend/index.html"
git add frontend/eslint.config.js 2>/dev/null && echo "✓ frontend/eslint.config.js"
git add frontend/README.md 2>/dev/null && echo "✓ frontend/README.md"

git add backend/core/ 2>/dev/null && echo "✓ backend/core/"
git add backend/config/ 2>/dev/null && echo "✓ backend/config/"
git add backend/manage.py 2>/dev/null && echo "✓ backend/manage.py"
git add backend/requirements.txt 2>/dev/null && echo "✓ backend/requirements.txt"

git add .gitignore 2>/dev/null && echo "✓ .gitignore"
git add *.md 2>/dev/null && echo "✓ *.md"
git add *.sh 2>/dev/null && echo "✓ *.sh"
git add *.bat 2>/dev/null && echo "✓ *.bat"
git add *.ps1 2>/dev/null && echo "✓ *.ps1"

echo ""
echo "步骤 5: 检查暂存区..."
LARGE_FILES=$(git ls-files --cached | grep -E "db.sqlite3|echodraw-master|GenWanMinTW|Ethereal-Regular|\.ttf$|\.woff$|\.woff2$|\.jpg$|\.png$|\.webp$" || true)
if [ -z "$LARGE_FILES" ]; then
    echo "✓ 暂存区中没有大文件"
else
    echo "✗ 警告: 发现大文件在暂存区:"
    echo "$LARGE_FILES"
    echo ""
    echo "正在移除..."
    echo "$LARGE_FILES" | xargs -r git rm --cached 2>/dev/null || true
    echo "✓ 已移除"
fi

echo ""
echo "步骤 6: 创建提交..."
git commit -m "Initial commit (clean, no large files)"
echo "✓ 已提交"
echo ""

echo "步骤 7: 检查仓库大小..."
NEW_SIZE=$(du -sh .git/objects 2>/dev/null | cut -f1)
echo "新的 .git/objects 大小: $NEW_SIZE"
echo ""

# 如果还是很大，显示详细信息
if [ -d ".git/objects" ]; then
    OBJECT_COUNT=$(find .git/objects -type f | wc -l)
    echo "对象数量: $OBJECT_COUNT"
fi

echo ""
echo "========================================"
echo "完成！"
echo "========================================"
echo ""
echo "如果大小仍然很大，运行以下命令查看详细信息:"
echo "  git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | grep blob | sort -k3 -n -r | head -10"
echo ""

