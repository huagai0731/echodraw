# 快速修复GitHub密钥问题

## 最简单的方法（推荐）

### 如果已经更换了泄露的密钥：

1. **访问GitHub允许链接**：
   https://github.com/huagai0731/echodraw/security/secret-scanning/unblock-secret/36guHJL0i5OaStNh13tVRMmTXqC

2. **点击 "Allow" 按钮**

3. **推送代码**：
   ```bash
   git push origin master
   ```

**完成！** 这是最快的方法。

---

## 如果密钥还没更换

### 步骤1：立即更换密钥

1. 登录 VolcEngine 控制台
2. 删除旧的 Access Key
3. 创建新的 Access Key
4. 更新服务器环境变量

### 步骤2：从Git历史中移除

```bash
# 设置环境变量抑制警告
export FILTER_BRANCH_SQUELCH_WARNING=1

# 从历史中移除敏感文件
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env.backup2 backend/.env.backup3" \
  --prune-empty --tag-name-filter cat -- --all

# 清理
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 强制推送
git push origin --force --all
```

---

## 为什么会出现这个问题？

GitHub会扫描**所有提交历史**，不仅仅是当前的文件。即使你删除了文件，历史提交中仍然包含敏感信息。

## 预防措施

✅ 已更新 `.gitignore` 文件，现在所有 `.env.backup*` 文件都会被忽略

✅ 以后所有敏感文件都不会被提交

---

## 建议

**如果这是个人仓库**：使用方法1（允许推送）最快

**如果这是团队仓库**：使用方法2（从历史移除）更安全

