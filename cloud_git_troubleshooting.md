# 云服务器 Git 网络问题解决方案

## 问题说明
`git fetch` 时出现 TLS 错误，可能是：
1. 网络连接不稳定
2. 文件太大导致超时
3. Git 缓冲区设置太小

## 解决方案

### 方案一：增加 Git 缓冲区大小（推荐）
```bash
git config --global http.postBuffer 524288000  # 500MB
git config --global http.maxRequestBuffer 100M
git config --global core.compression 0
```

然后重试：
```bash
git fetch origin
git reset --hard origin/master
```

### 方案二：使用 SSH 代替 HTTPS
如果当前使用 HTTPS，可以切换到 SSH：
```bash
# 查看当前远程 URL
git remote -v

# 切换到 SSH（需要先配置 SSH key）
git remote set-url origin git@github.com:huagai0731/echodraw.git

# 然后重试
git fetch origin
```

### 方案三：分步拉取
```bash
# 只拉取 master 分支
git fetch origin master

# 或者直接拉取并合并
git pull origin master
```

### 方案四：验证当前状态
检查是否已经同步成功：
```bash
# 查看当前分支和提交
git log --oneline -5

# 查看远程和本地的差异
git fetch origin 2>&1 | head -20  # 如果还有错误，只看前20行
git status

# 比较本地和远程
git log HEAD..origin/master --oneline  # 远程有本地没有的
git log origin/master..HEAD --oneline  # 本地有远程没有的
```

### 方案五：如果网络持续有问题，直接重新克隆
```bash
cd /root/echo
cd ..
# 备份当前项目
mv echo echo-backup-$(date +%Y%m%d)

# 重新克隆
git clone https://github.com/huagai0731/echodraw.git echo

# 恢复配置文件
cp echo-backup-*/backend/.env echo/backend/.env 2>/dev/null || true
cp echo-backup-*/frontend/.env echo/frontend/.env 2>/dev/null || true
```

