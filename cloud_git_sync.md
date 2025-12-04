# 云服务器 Git 同步方案

## 场景说明
本地强制推送后，云服务器上的代码可能与远程不一致，需要同步。

## 方案一：云服务器重置到远程最新（推荐）
如果云服务器上的本地修改不重要，直接重置到远程最新：

```bash
# 在云服务器上执行
cd /path/to/your/project

# 获取远程最新内容
git fetch origin

# 重置到远程 master 分支（会丢弃本地未提交的更改）
git reset --hard origin/master

# 或者如果你想保留本地未提交的文件，先暂存
git stash
git reset --hard origin/master
git stash pop  # 如果需要恢复本地文件
```

## 方案二：合并远程更改
如果云服务器上有重要修改需要保留：

```bash
# 在云服务器上执行
cd /path/to/your/project

# 拉取远程更改
git pull origin master

# 如果有冲突，解决冲突后：
git add .
git commit -m "合并远程更改"
```

## 方案三：完全重新克隆（最简单）
如果云服务器上的内容不重要，直接重新克隆：

```bash
# 在云服务器上执行
cd /path/to/parent/directory

# 备份当前项目（可选）
mv your-project your-project-backup

# 重新克隆
git clone https://github.com/huagai0731/echodraw.git your-project

# 或者如果项目已存在，删除后重新克隆
rm -rf your-project
git clone https://github.com/huagai0731/echodraw.git your-project
```

## 方案四：先查看云服务器上的差异
先看看云服务器上有什么不同：

```bash
# 在云服务器上执行
cd /path/to/your/project

# 查看当前状态
git status

# 查看本地和远程的差异
git fetch origin
git log HEAD..origin/master --oneline  # 远程有本地没有的
git log origin/master..HEAD --oneline  # 本地有远程没有的

# 查看文件差异
git diff origin/master
```

## 推荐流程

### 步骤 1：本地强制推送（已完成或即将执行）
```bash
git push origin master --force
```

### 步骤 2：在云服务器上同步
根据云服务器上的情况选择：

**如果云服务器上的修改不重要：**
```bash
git fetch origin
git reset --hard origin/master
```

**如果云服务器上有重要修改：**
```bash
# 先备份重要文件
cp -r important_files backup/

# 然后重置
git fetch origin
git reset --hard origin/master

# 恢复重要文件
cp -r backup/important_files ./
```

