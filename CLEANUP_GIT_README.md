# Git 仓库清理指南

## 问题
仓库中有大文件导致推送很慢（约 75 MB）：
- `backend/db.sqlite3` (~972 MB) - 数据库文件
- `echodraw-master/` (~18 MB) - 旧项目目录
- `frontend/dist/` (~50 MB) - 构建产物
- `backend/media/` (~7 MB) - 用户上传的媒体文件
- `backend/logs/` - 日志文件

## 解决方案

### 方案 1: 如果还没有推送到远程（推荐）

1. 运行清理脚本：
   ```powershell
   .\cleanup_git.ps1
   ```

2. 提交更改：
   ```bash
   git add .gitignore
   git commit -m "Remove large files and update .gitignore"
   ```

3. 正常推送即可

### 方案 2: 如果已经推送到远程

如果这些文件已经在远程仓库的历史中，需要清理 git 历史：

#### 选项 A: 使用 git filter-branch（官方方法）

```bash
# 移除 db.sqlite3
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/db.sqlite3" \
  --prune-empty --tag-name-filter cat -- --all

# 移除 echodraw-master 目录
git filter-branch --force --index-filter \
  "git rm -r --cached --ignore-unmatch echodraw-master" \
  --prune-empty --tag-name-filter cat -- --all

# 移除 dist 目录
git filter-branch --force --index-filter \
  "git rm -r --cached --ignore-unmatch frontend/dist" \
  --prune-empty --tag-name-filter cat -- --all

# 强制推送（危险操作，确保团队知道）
git push origin --force --all
```

#### 选项 B: 使用 BFG Repo-Cleaner（更快，推荐）

1. 下载 BFG: https://rtyley.github.io/bfg-repo-cleaner/

2. 运行清理：
   ```bash
   # 删除文件
   java -jar bfg.jar --delete-files db.sqlite3
   java -jar bfg.jar --delete-folders echodraw-master
   java -jar bfg.jar --delete-folders dist
   
   # 清理引用
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   
   # 强制推送
   git push origin --force --all
   ```

### 方案 3: 创建新仓库（最简单，如果历史不重要）

如果 git 历史不重要，可以：

1. 删除 `.git` 目录
2. 重新初始化 git
3. 提交当前代码（大文件已被 .gitignore 排除）
4. 推送到新仓库

## 预防措施

已更新 `.gitignore` 文件，确保以下文件/目录不会被提交：
- `backend/db.sqlite3`
- `backend/media/`
- `backend/logs/`
- `frontend/dist/`
- `frontend/node_modules/`
- `echodraw-master/`
- 字体文件 (*.ttf, *.woff, *.woff2)
- 大图片文件 (*.jpg, *.png, *.webp)

## 注意事项

⚠️ **重要**: 
- 清理 git 历史会改变提交哈希，如果其他人也在使用这个仓库，需要协调
- 强制推送会覆盖远程历史，确保团队知道
- 建议先备份仓库
- 数据库文件应该在生产服务器上单独管理，不要提交到 git

