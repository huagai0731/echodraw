#!/bin/bash
# 从Git历史中移除敏感文件的脚本

echo "⚠️  警告：这个操作会重写Git历史！"
echo "如果这是共享仓库，请先通知团队成员。"
echo ""
read -p "是否继续？(yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "已取消操作"
    exit 1
fi

# 方法1：使用 git filter-branch（如果git filter-repo不可用）
echo "正在从Git历史中移除敏感文件..."

# 设置环境变量以抑制警告
export FILTER_BRANCH_SQUELCH_WARNING=1

# 从所有分支和标签中移除文件
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env.backup2 backend/.env.backup3" \
  --prune-empty --tag-name-filter cat -- --all

# 清理引用
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "✅ 完成！现在可以推送了："
echo "   git push origin --force --all"
echo ""
echo "⚠️  注意：如果这是共享仓库，团队成员需要重新克隆仓库"

