#!/bin/bash
# 从 Git 历史中移除 backend/.env 文件的脚本

echo "⚠️  警告：这将重写 Git 历史，如果其他人也在使用这个仓库，请先通知他们！"
echo ""
read -p "确认继续？(yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "已取消操作"
    exit 1
fi

echo "正在从 Git 历史中移除 backend/.env 文件..."

# 方法 1: 使用 git filter-branch（Git 自带）
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env" \
  --prune-empty --tag-name-filter cat -- --all

# 清理引用
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "✅ 完成！现在可以执行："
echo "   git push origin --force --all"
echo "   git push origin --force --tags"



