@echo off
chcp 65001 >nul
echo ========================================
echo 彻底删除并重建 Git 仓库
echo ========================================
echo.

echo 步骤 1: 删除 .git 目录...
if exist .git (
    rmdir /s /q .git
    echo ✓ 已删除
) else (
    echo .git 目录不存在
)
echo.

echo 步骤 2: 重新初始化 Git...
git init
if %errorlevel% equ 0 (
    echo ✓ 已初始化
) else (
    echo ✗ Git 初始化失败，请确保已安装 Git
    pause
    exit /b 1
)
echo.

echo 步骤 3: 添加文件（排除大文件）...
echo 正在添加前端文件...
git add frontend/src/ 2>nul && echo ✓ frontend/src/
git add frontend/package*.json 2>nul && echo ✓ frontend/package*.json
git add frontend/tsconfig*.json 2>nul && echo ✓ frontend/tsconfig*.json
git add frontend/vite.config.ts 2>nul && echo ✓ frontend/vite.config.ts
git add frontend/index.html 2>nul && echo ✓ frontend/index.html
git add frontend/eslint.config.js 2>nul && echo ✓ frontend/eslint.config.js
if exist frontend\README.md (
    git add frontend/README.md 2>nul && echo ✓ frontend/README.md
)

echo.
echo 正在添加后端文件...
git add backend/core/ 2>nul && echo ✓ backend/core/
git add backend/config/ 2>nul && echo ✓ backend/config/
git add backend/manage.py 2>nul && echo ✓ backend/manage.py
git add backend/requirements.txt 2>nul && echo ✓ backend/requirements.txt

echo.
echo 正在添加配置文件...
git add .gitignore 2>nul && echo ✓ .gitignore
git add *.md 2>nul && echo ✓ *.md
git add *.sh 2>nul && echo ✓ *.sh
git add *.bat 2>nul && echo ✓ *.bat
git add *.ps1 2>nul && echo ✓ *.ps1
echo.

echo 步骤 4: 检查暂存区中是否有大文件...
git ls-files --cached > temp_files.txt 2>nul
findstr /i "db.sqlite3 echodraw-master GenWanMinTW Ethereal-Regular .ttf .woff .woff2 .jpg .png .webp" temp_files.txt > temp_large.txt 2>nul

if exist temp_large.txt (
    for %%f in (temp_large.txt) do set size=%%~zf
    if !size! gtr 0 (
        echo ✗ 发现大文件在暂存区:
        type temp_large.txt
        echo.
        echo 正在移除...
        for /f "tokens=*" %%a in (temp_large.txt) do (
            git rm --cached "%%a" 2>nul
        )
        echo ✓ 已移除
    ) else (
        echo ✓ 暂存区中没有大文件
    )
    del temp_large.txt 2>nul
) else (
    echo ✓ 暂存区中没有大文件
)
del temp_files.txt 2>nul
echo.

echo 步骤 5: 创建提交...
git commit -m "Initial commit (clean, no large files)"
if %errorlevel% equ 0 (
    echo ✓ 已提交
) else (
    echo ✗ 提交失败
)
echo.

echo 步骤 6: 检查仓库大小...
if exist .git\objects (
    echo 正在计算 .git/objects 大小...
    for /f "tokens=*" %%a in ('powershell -Command "(Get-ChildItem -Path .git\objects -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB"') do set size_mb=%%a
    echo 新的 .git/objects 大小: !size_mb! MB
) else (
    echo .git/objects 目录不存在
)
echo.

echo ========================================
echo 完成！
echo ========================================
echo.
echo 如果大小仍然很大，请检查是否有其他大文件被添加
echo.
pause

