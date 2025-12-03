#!/bin/bash

# 初始化 Git 仓库
echo "正在初始化 Git 仓库..."
git init

# 检查是否有远程仓库配置
if [ -f ".git/config" ]; then
    echo ""
    echo "当前 Git 配置："
    git remote -v
    echo ""
fi

# 显示状态
echo "当前 Git 状态："
git status

echo ""
echo "下一步操作："
echo "1. 如果有远程仓库，请运行: git remote add origin <远程仓库URL>"
echo "2. 添加文件: git add ."
echo "3. 提交: git commit -m \"你的提交信息\""
echo "4. 推送: git push origin master (或 main)"

