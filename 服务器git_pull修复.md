# 服务器 Git Pull 冲突修复

## 问题
`db.sqlite3` 文件有本地修改，Git pull 时冲突。

## 解决方案

### 方法 1：暂存本地更改（推荐，如果数据库有重要数据）

```bash
# 1. 暂存本地更改
git stash

# 2. 拉取最新代码
git pull

# 3. 如果需要恢复本地的数据库更改（通常不需要）
# git stash pop
```

### 方法 2：放弃本地数据库更改（推荐，数据库文件不应该被跟踪）

```bash
# 1. 检查 .gitignore 是否包含 db.sqlite3
cat ../.gitignore | grep db.sqlite3

# 2. 如果包含，从 Git 中移除跟踪（但保留本地文件）
cd ..
git rm --cached backend/db.sqlite3
git commit -m "Remove db.sqlite3 from tracking"

# 3. 拉取最新代码
git pull

# 4. 如果还有冲突，强制使用远程版本
git checkout --theirs backend/db.sqlite3
git pull
```

### 方法 3：直接使用远程版本（最简单）

```bash
# 1. 放弃本地数据库文件的更改
git checkout --theirs backend/db.sqlite3

# 2. 或者直接删除（数据库会重新生成）
rm backend/db.sqlite3

# 3. 拉取最新代码
git pull
```

### 方法 4：确保 db.sqlite3 不被跟踪（长期解决方案）

```bash
# 1. 从 Git 中移除 db.sqlite3（如果之前被跟踪了）
cd ~/echo
git rm --cached backend/db.sqlite3

# 2. 确保 .gitignore 包含它
echo "backend/db.sqlite3" >> .gitignore

# 3. 提交更改
git add .gitignore
git commit -m "Ensure db.sqlite3 is ignored"

# 4. 拉取
git pull
```

## 推荐操作（在服务器上执行）

```bash
# 快速修复
cd ~/echo/backend
git checkout -- backend/db.sqlite3  # 放弃本地更改
cd ~/echo
git pull

# 或者如果数据库文件不重要
rm ~/echo/backend/db.sqlite3
cd ~/echo
git pull
```


