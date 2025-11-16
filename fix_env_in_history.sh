#!/bin/bash
# 一键从 Git 历史中移除 backend/.env 文件

set -e

echo "🔍 检查 Git 历史中是否包含 backend/.env..."
if git log --all --full-history --oneline -- backend/.env | grep -q .; then
    echo "❌ 发现 backend/.env 在 Git 历史中，开始清理..."
else
    echo "✅ backend/.env 不在 Git 历史中"
    exit 0
fi

echo ""
echo "⚠️  警告：这将重写 Git 历史！"
echo "   如果其他人也在使用这个仓库，请先通知他们！"
echo ""
read -p "确认继续？(输入 yes 继续): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ 已取消操作"
    exit 1
fi

echo ""
echo "🧹 开始清理 Git 历史..."

# 从所有分支和标签中移除 backend/.env
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env" \
  --prune-empty --tag-name-filter cat -- --all

# 清理引用
echo "🧹 清理引用..."
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin 2>/dev/null || true
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "✅ 清理完成！"
echo ""
echo "📤 现在可以执行以下命令推送："
echo "   git push origin --force --all"
echo "   git push origin --force --tags"
echo ""
echo "⚠️  注意：强制推送会重写远程历史，其他团队成员需要重新克隆仓库"


