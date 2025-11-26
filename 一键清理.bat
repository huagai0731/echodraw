@echo off
chcp 65001 >nul
echo ========================================
echo 一键清理 Git 仓库
echo ========================================
echo.
echo 检测到你在 CMD 中运行，但 git 命令不在 PATH 中
echo.
echo 请使用以下方法之一：
echo.
echo 方法 1: 使用 Git Bash（推荐）
echo   1. 右键点击项目文件夹
echo   2. 选择 "Git Bash Here"
echo   3. 运行: chmod +x 彻底删除并重建.sh
echo   4. 运行: ./彻底删除并重建.sh
echo.
echo 方法 2: 手动在 Git Bash 中执行
echo   打开 Git Bash，然后运行：
echo   rm -rf .git
echo   git init
echo   git add frontend/src/
echo   git add frontend/package*.json
echo   git add frontend/tsconfig*.json
echo   git add frontend/vite.config.ts
echo   git add frontend/index.html
echo   git add frontend/eslint.config.js
echo   git add backend/core/
echo   git add backend/config/
echo   git add backend/manage.py
echo   git add backend/requirements.txt
echo   git add .gitignore
echo   git add *.md *.sh *.bat *.ps1
echo   git commit -m "Initial commit (clean)"
echo   du -sh .git/objects
echo.
echo 方法 3: 尝试自动查找 Git 路径
echo.

REM 尝试查找 Git
set "GIT_PATH="
if exist "C:\Program Files\Git\bin\git.exe" (
    set "GIT_PATH=C:\Program Files\Git\bin\git.exe"
) else if exist "C:\Program Files (x86)\Git\bin\git.exe" (
    set "GIT_PATH=C:\Program Files (x86)\Git\bin\git.exe"
) else (
    echo 未找到 Git，请使用方法 1 或 2
    pause
    exit /b 1
)

echo 找到 Git: %GIT_PATH%
echo.
echo 正在执行清理...
echo.

REM 删除 .git
if exist .git (
    echo 删除 .git 目录...
    rmdir /s /q .git
    echo ✓ 已删除
    echo.
)

REM 重新初始化
echo 重新初始化 Git...
"%GIT_PATH%" init
if %errorlevel% equ 0 (
    echo ✓ 已初始化
) else (
    echo ✗ 初始化失败
    pause
    exit /b 1
)
echo.

echo 添加文件...
"%GIT_PATH%" add frontend/src/ 2>nul && echo ✓ frontend/src/
"%GIT_PATH%" add frontend/package*.json 2>nul && echo ✓ frontend/package*.json
"%GIT_PATH%" add frontend/tsconfig*.json 2>nul && echo ✓ frontend/tsconfig*.json
"%GIT_PATH%" add frontend/vite.config.ts 2>nul && echo ✓ frontend/vite.config.ts
"%GIT_PATH%" add frontend/index.html 2>nul && echo ✓ frontend/index.html
"%GIT_PATH%" add frontend/eslint.config.js 2>nul && echo ✓ frontend/eslint.config.js
"%GIT_PATH%" add backend/core/ 2>nul && echo ✓ backend/core/
"%GIT_PATH%" add backend/config/ 2>nul && echo ✓ backend/config/
"%GIT_PATH%" add backend/manage.py 2>nul && echo ✓ backend/manage.py
"%GIT_PATH%" add backend/requirements.txt 2>nul && echo ✓ backend/requirements.txt
"%GIT_PATH%" add .gitignore 2>nul && echo ✓ .gitignore
"%GIT_PATH%" add *.md 2>nul && echo ✓ *.md
"%GIT_PATH%" add *.sh 2>nul && echo ✓ *.sh
"%GIT_PATH%" add *.bat 2>nul && echo ✓ *.bat
"%GIT_PATH%" add *.ps1 2>nul && echo ✓ *.ps1
echo.

echo 检查大文件...
"%GIT_PATH%" ls-files --cached > temp_check.txt 2>nul
findstr /i "db.sqlite3 echodraw-master GenWanMinTW Ethereal-Regular .ttf .woff .woff2" temp_check.txt >nul 2>&1
if %errorlevel% equ 0 (
    echo ✗ 发现大文件，正在移除...
    for /f "tokens=*" %%a in ('findstr /i "db.sqlite3 echodraw-master GenWanMinTW Ethereal-Regular .ttf .woff .woff2" temp_check.txt') do (
        "%GIT_PATH%" rm --cached "%%a" 2>nul
    )
    echo ✓ 已移除
) else (
    echo ✓ 暂存区中没有大文件
)
del temp_check.txt 2>nul
echo.

echo 创建提交...
"%GIT_PATH%" commit -m "Initial commit (clean, no large files)"
if %errorlevel% equ 0 (
    echo ✓ 已提交
) else (
    echo ✗ 提交失败（可能没有文件需要提交）
)
echo.

echo 检查仓库大小...
if exist .git\objects (
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
pause

