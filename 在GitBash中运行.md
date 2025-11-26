# 在 Git Bash 中运行

## 方法 1: 打开 Git Bash 并运行脚本

1. **右键点击项目文件夹** → 选择 **"Git Bash Here"**

2. 在 Git Bash 中运行：
   ```bash
   chmod +x 彻底删除并重建.sh
   ./彻底删除并重建.sh
   ```

## 方法 2: 手动在 Git Bash 中执行

打开 Git Bash，然后执行：

```bash
# 1. 删除 .git
rm -rf .git

# 2. 重新初始化
git init

# 3. 添加文件（不要用 git add .）
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

# 4. 检查是否有大文件
git ls-files --cached | grep -E "db.sqlite3|echodraw-master|GenWanMinTW|\.ttf|\.jpg|\.png|\.webp"

# 5. 提交
git commit -m "Initial commit (clean)"

# 6. 检查大小
du -sh .git/objects
```

## 方法 3: 在 CMD 中使用完整路径

如果你知道 Git 的安装路径（通常在 `C:\Program Files\Git\bin\git.exe`），可以在 CMD 中这样运行：

```cmd
"C:\Program Files\Git\bin\git.exe" init
```

但最简单的方法还是用 Git Bash！

