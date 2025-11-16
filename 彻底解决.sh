#!/bin/bash
# 彻底解决 GitHub 推送保护问题

echo "🔍 检查问题提交..."
git log --oneline | grep 956aaac

echo ""
echo "方案 1: 使用交互式 rebase 编辑该提交（推荐）"
echo "方案 2: 完全重置 master 分支（最简单，但会丢失历史）"
echo ""
read -p "选择方案 (1/2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    echo "📝 使用交互式 rebase 编辑提交 956aaac..."
    echo "   在编辑器中，找到包含 956aaac 的那一行，将 'pick' 改为 'edit'"
    echo "   保存退出后，会自动进入编辑模式"
    echo ""
    read -p "按回车继续..."
    
    # 找到 956aaac 的父提交
    PARENT=$(git log --oneline | grep -A 1 956aaac | tail -1 | awk '{print $1}')
    
    if [ -z "$PARENT" ]; then
        PARENT="956aaac^1"
    fi
    
    git rebase -i $PARENT
    
    echo ""
    echo "如果 rebase 成功，现在执行："
    echo "  git rm --cached backend/.env"
    echo "  git commit --amend --no-edit"
    echo "  git rebase --continue"
    echo "  git push origin master --force"
    
elif [ "$choice" == "2" ]; then
    echo ""
    echo "⚠️  警告：这将完全重置 master 分支，删除所有历史！"
    read -p "确认继续？(输入 yes): " confirm
    
    if [ "$confirm" == "yes" ]; then
        echo ""
        echo "📦 备份当前代码..."
        cd ..
        cp -r echo echo-backup-$(date +%Y%m%d-%H%M%S)
        cd echo
        
        echo "🗑️  删除 Git 历史..."
        rm -rf .git
        
        echo "🔄 重新初始化..."
        git init
        git add .
        git commit -m "Clean commit: removed sensitive information from history"
        
        echo "🔗 设置远程仓库..."
        git remote add origin https://github.com/huagai0731/echodraw.git 2>/dev/null || \
        git remote set-url origin https://github.com/huagai0731/echodraw.git
        
        echo ""
        echo "✅ 准备就绪！现在执行："
        echo "   git push -u origin master --force"
        echo ""
        echo "⚠️  这会完全替换远程的 master 分支"
    else
        echo "已取消"
    fi
fi


