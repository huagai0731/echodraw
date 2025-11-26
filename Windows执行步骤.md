# Windows 执行步骤

## 方法 1: 使用批处理文件（推荐）

在 **CMD** 或 **PowerShell** 中运行：

```cmd
彻底删除并重建.bat
```

## 方法 2: 使用 Git Bash（推荐）

如果你安装了 Git for Windows，打开 **Git Bash**，然后运行：

```bash
chmod +x 彻底删除并重建.sh
./彻底删除并重建.sh
```

## 方法 3: 手动在 CMD 中执行

```cmd
REM 1. 删除 .git
rmdir /s /q .git

REM 2. 重新初始化
git init

REM 3. 添加文件
git add frontend/src/
git add frontend/package*.json
git add frontend/tsconfig*.json
git add frontend/vite.config.ts
git add frontend/index.html
git add frontend/eslint.config.js
git add backend/core/
git add backend/config/
git add backend/manage.py
git add backend/requirements.txt
git add .gitignore
git add *.md *.sh *.bat *.ps1

REM 4. 检查大文件
git ls-files --cached | findstr /i "db.sqlite3 echodraw-master GenWanMinTW .ttf .jpg .png"

REM 5. 提交
git commit -m "Initial commit (clean)"

REM 6. 检查大小（在 PowerShell 中）
powershell -Command "(Get-ChildItem -Path .git\objects -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB"
```

## 方法 4: 在 PowerShell 中执行

```powershell
# 1. 删除 .git
Remove-Item -Recurse -Force .git

# 2. 重新初始化
git init

# 3. 添加文件
git add frontend/src/
git add frontend/package*.json
git add frontend/tsconfig*.json
git add frontend/vite.config.ts
git add frontend/index.html
git add frontend/eslint.config.js
git add backend/core/
git add backend/config/
git add backend/manage.py
git add backend/requirements.txt
git add .gitignore
git add *.md, *.sh, *.bat, *.ps1

# 4. 检查大文件
git ls-files --cached | Select-String -Pattern "db.sqlite3|echodraw-master|GenWanMinTW|\.ttf|\.jpg|\.png"

# 5. 提交
git commit -m "Initial commit (clean)"

# 6. 检查大小
$size = (Get-ChildItem -Path .git\objects -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "新的 .git/objects 大小: $([math]::Round($size,2)) MB"
```

## 推荐

**最简单的方法**：直接双击运行 `彻底删除并重建.bat` 文件！

