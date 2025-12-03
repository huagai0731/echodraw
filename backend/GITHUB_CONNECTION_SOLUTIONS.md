# 云服务器连接GitHub解决方案

当遇到 `gitclone.com` 返回 502 错误时，可以使用以下方法：

## 方案1：更换GitHub镜像源（推荐）

### 使用 ghproxy.com 镜像
```bash
# 查看当前remote
git remote -v

# 修改origin URL为ghproxy镜像
git remote set-url origin https://ghproxy.com/https://github.com/huagai0731/echodraw.git

# 或者使用fastgit镜像
git remote set-url origin https://hub.fastgit.xyz/huagai0731/echodraw.git
```

### 使用其他可用镜像
```bash
# 镜像1: ghproxy.com
git remote set-url origin https://ghproxy.com/https://github.com/huagai0731/echodraw.git

# 镜像2: hub.fastgit.xyz (如果可用)
git remote set-url origin https://hub.fastgit.xyz/huagai0731/echodraw.git

# 镜像3: github.com.cnpmjs.org
git remote set-url origin https://github.com.cnpmjs.org/huagai0731/echodraw.git

# 镜像4: 直接使用GitHub（如果网络允许）
git remote set-url origin https://github.com/huagai0731/echodraw.git
```

## 方案2：使用SSH连接（最稳定）

### 配置SSH密钥
```bash
# 1. 生成SSH密钥（如果还没有）
ssh-keygen -t ed25519 -C "your_email@example.com"

# 2. 查看公钥
cat ~/.ssh/id_ed25519.pub

# 3. 将公钥添加到GitHub: Settings -> SSH and GPG keys -> New SSH key

# 4. 修改remote为SSH地址
git remote set-url origin git@github.com:huagai0731/echodraw.git
```

## 方案3：配置Git代理（如果有代理服务器）

### HTTP/HTTPS代理
```bash
# 设置全局代理
git config --global http.proxy http://proxy.example.com:8080
git config --global https.proxy https://proxy.example.com:8080

# 只对GitHub设置代理
git config --global http.https://github.com.proxy http://proxy.example.com:8080

# 取消代理
git config --global --unset http.proxy
git config --global --unset https.proxy
```

### SOCKS5代理
```bash
git config --global http.proxy socks5://127.0.0.1:1080
git config --global https.proxy socks5://127.0.0.1:1080
```

## 方案4：临时使用镜像克隆（如果无法修改remote）

```bash
# 使用镜像克隆到新目录
git clone https://ghproxy.com/https://github.com/huagai0731/echodraw.git echodraw_new

# 或者使用fastgit
git clone https://hub.fastgit.xyz/huagai0731/echodraw.git echodraw_new
```

## 方案5：处理SSL/TLS错误

如果遇到 `gnutls_handshake() failed` 错误，可以尝试：

### 方法A：更新CA证书
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ca-certificates

# CentOS/RHEL
sudo yum update ca-certificates
```

### 方法B：临时跳过SSL验证（不推荐，仅用于测试）
```bash
# 仅对当前仓库跳过SSL验证
git config http.sslVerify false

# 或者全局设置（不推荐）
git config --global http.sslVerify false

# 使用后记得恢复
git config --global http.sslVerify true
```

### 方法C：使用HTTP代替HTTPS（不推荐，不安全）
```bash
# 某些镜像支持HTTP
git remote set-url origin http://github.com.cnpmjs.org/huagai0731/echodraw.git
```

## 快速修复命令（针对当前问题）

在云服务器上执行（按顺序尝试）：

```bash
# 进入backend目录
cd ~/echo/backend

# 方案1: 尝试其他镜像（推荐）
git remote set-url origin https://github.com.cnpmjs.org/huagai0731/echodraw.git
git pull

# 方案2: 如果方案1不行，尝试直接使用GitHub
git remote set-url origin https://github.com/huagai0731/echodraw.git
git pull

# 方案3: 尝试使用mirror.ghproxy.com（ghproxy的备用域名）
git remote set-url origin https://mirror.ghproxy.com/https://github.com/huagai0731/echodraw.git
git pull

# 方案4: 如果SSL错误持续，临时禁用SSL验证（仅用于测试）
git config http.sslVerify false
git pull
git config http.sslVerify true  # 记得恢复

# 方案5: 使用SSH方式（最稳定，需要先配置SSH密钥）
git remote set-url origin git@github.com:huagai0731/echodraw.git
git pull
```

## 验证配置

```bash
# 查看当前remote配置
git remote -v

# 测试连接
git fetch
```

## 注意事项

1. **镜像服务可能不稳定**：不同镜像在不同时间可能可用性不同，建议多准备几个备选方案
2. **SSH最稳定**：如果可能，优先使用SSH方式连接
3. **代理配置**：如果有稳定的代理服务，配置代理是最可靠的方案
4. **定期更新**：镜像服务可能会变化，需要定期检查

## 常见镜像服务列表

- `ghproxy.com` - GitHub代理加速服务
- `hub.fastgit.xyz` - FastGit镜像
- `github.com.cnpmjs.org` - CNPM镜像
- `gitclone.com` - GitClone镜像（当前不可用）

