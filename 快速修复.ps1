# PowerShell 脚本：快速修复 Git 敏感信息问题

Write-Host "🔍 检查 Git 历史中是否包含敏感信息..." -ForegroundColor Yellow

# 检查 .env 文件是否在历史中
$envInHistory = git log --all --full-history --oneline -- backend/.env 2>$null
if ($envInHistory) {
    Write-Host "❌ 发现 backend/.env 在 Git 历史中" -ForegroundColor Red
    Write-Host ""
    Write-Host "选择修复方案：" -ForegroundColor Cyan
    Write-Host "1. 使用 git filter-branch（标准方法）"
    Write-Host "2. 完全重置 master 分支（会丢失历史，但最彻底）"
    Write-Host "3. 只清理最近的提交"
    Write-Host ""
    $choice = Read-Host "请选择 (1/2/3)"
    
    switch ($choice) {
        "1" {
            Write-Host "执行 git filter-branch..." -ForegroundColor Green
            git filter-branch --force --index-filter "git rm --cached --ignore-unmatch backend/.env" --prune-empty --tag-name-filter cat -- --all
            git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
            git reflog expire --expire=now --all
            git gc --prune=now --aggressive
            Write-Host "✅ 清理完成！现在执行: git push origin --force --all" -ForegroundColor Green
        }
        "2" {
            Write-Host "⚠️  警告：这将删除所有 Git 历史！" -ForegroundColor Red
            $confirm = Read-Host "确认继续？(输入 yes)"
            if ($confirm -eq "yes") {
                Write-Host "备份当前代码..." -ForegroundColor Yellow
                Copy-Item -Path . -Destination ..\echo-backup -Recurse -Force
                Write-Host "重新初始化 Git..." -ForegroundColor Yellow
                Remove-Item -Path .git -Recurse -Force
                git init
                git add .
                git commit -m "Initial commit (cleaned history)"
                git remote add origin https://github.com/huagai0731/echodraw.git
                Write-Host "✅ 准备就绪！现在执行: git push -u origin master --force" -ForegroundColor Green
            }
        }
        "3" {
            Write-Host "查看最近的提交..." -ForegroundColor Yellow
            git log --oneline -10
            $commitHash = Read-Host "输入包含 .env 的提交 hash（前7位即可）"
            git rebase -i "$commitHash^1"
            Write-Host "在编辑器中，将包含 .env 的提交标记为 'edit'，然后保存退出" -ForegroundColor Yellow
            Write-Host "完成后执行: git rm --cached backend/.env && git commit --amend --no-edit && git rebase --continue" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "✅ backend/.env 不在 Git 历史中" -ForegroundColor Green
    Write-Host "检查是否有其他文件包含敏感信息..." -ForegroundColor Yellow
    git log --all --full-history -S "TOS_ACCESS_KEY_ID" --source --all 2>$null
}


