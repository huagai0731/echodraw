#!/bin/bash
# 一键修复：直接编辑问题提交

echo "🎯 直接修复提交 956aaac45ac4b994d9c951f9c452bd322fb1be8b"

# 方法：使用 git rebase 编辑该提交
COMMIT_HASH="956aaac45ac4b994d9c951f9c452bd322fb1be8b"

echo "查找该提交的父提交..."
PARENT=$(git log --format="%H %P" | grep -A 1 "$COMMIT_HASH" | tail -1 | awk '{print $2}')

if [ -z "$PARENT" ]; then
    PARENT="${COMMIT_HASH}^1"
fi

echo "父提交: $PARENT"
echo ""
echo "开始交互式 rebase..."
echo "在打开的编辑器中："
echo "1. 找到包含 $COMMIT_HASH 的那一行"
echo "2. 将行首的 'pick' 改为 'edit'"
echo "3. 保存并退出编辑器"
echo ""
read -p "按回车继续..."

git rebase -i $PARENT

echo ""
echo "如果 rebase 成功进入编辑模式，执行以下命令："
echo ""
echo "  git rm --cached backend/.env"
echo "  git commit --amend --no-edit"  
echo "  git rebase --continue"
echo ""
echo "完成后执行："
echo "  git push origin master --force"


