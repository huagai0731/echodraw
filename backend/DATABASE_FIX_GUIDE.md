# 数据库迁移问题修复指南

本指南提供了一套完整的工具来一劳永逸地解决数据库迁移问题。

## 问题描述

常见的数据库迁移问题包括：
- 模型中有字段，但数据库表中缺少该字段（如 `core_userupload.thumbnail`）
- 迁移文件存在但未应用到数据库
- 数据库结构与模型定义不一致

## 解决方案

### 方案1: 一键修复（推荐）

**Windows (PowerShell):**
```powershell
cd backend
.\quick_fix_database.ps1
```

**Linux/Mac:**
```bash
cd backend
chmod +x quick_fix_database.sh
./quick_fix_database.sh
```

这个脚本会自动：
1. 检查迁移状态
2. 应用所有未应用的迁移
3. 检查数据库结构
4. 修复缺失的字段

### 方案2: 分步执行

#### 步骤1: 检查迁移状态
```bash
python manage.py showmigrations
```

#### 步骤2: 应用迁移
```bash
python manage.py migrate
```

#### 步骤3: 运行迁移确保脚本
```bash
python ensure_migrations.py
```

这个脚本会：
- 检查所有未应用的迁移
- 自动应用迁移
- 检查数据库表结构是否与模型一致
- 报告任何不一致的地方

#### 步骤4: 修复数据库结构（如果需要）
```bash
python fix_database_structure.py
```

这个脚本会：
- 检测缺失的字段
- 自动创建缺失的字段（如果可能）
- 报告无法自动修复的问题

### 方案3: 部署前检查

在部署到生产环境前，运行：
```bash
python deploy_check.py
```

这个脚本会检查：
- 环境变量配置
- 数据库连接
- 迁移状态
- 关键表和字段

## 工具说明

### 1. `ensure_migrations.py`
**用途**: 确保所有迁移都已应用

**功能**:
- 检查迁移状态
- 自动应用未应用的迁移
- 检查数据库表结构
- 提供详细的错误报告

**使用方法**:
```bash
python ensure_migrations.py
```

### 2. `fix_database_structure.py`
**用途**: 修复数据库结构与模型不一致的问题

**功能**:
- 检测缺失的字段
- 自动生成并执行SQL来添加缺失字段
- 处理常见的数据类型转换
- 报告无法自动修复的问题

**使用方法**:
```bash
python fix_database_structure.py
```

**注意**: 这个脚本会直接修改数据库结构，建议在生产环境使用前先在测试环境验证。

### 3. `deploy_check.py`
**用途**: 部署前的全面检查

**功能**:
- 检查环境变量
- 检查数据库连接
- 检查迁移状态
- 检查关键表和字段

**使用方法**:
```bash
python deploy_check.py
```

### 4. `quick_fix_database.sh` / `quick_fix_database.ps1`
**用途**: 一键执行所有修复步骤

**功能**:
- 自动执行所有必要的检查和修复
- 适用于快速修复和部署前准备

## 常见问题

### Q: 运行迁移时出现 "Unknown column" 错误

**A**: 这通常是因为迁移未正确应用。解决步骤：
1. 运行 `python ensure_migrations.py` 检查迁移状态
2. 运行 `python fix_database_structure.py` 修复缺失字段
3. 如果问题仍然存在，检查迁移文件是否正确

### Q: 迁移文件存在但字段仍然缺失

**A**: 可能的原因：
1. 迁移未应用到数据库
2. 迁移文件有错误
3. 数据库被手动修改过

解决步骤：
1. 运行 `python manage.py showmigrations` 查看哪些迁移未应用
2. 运行 `python manage.py migrate` 应用迁移
3. 如果迁移已应用但字段仍缺失，运行 `python fix_database_structure.py`

### Q: 如何防止将来出现类似问题？

**A**: 建议：
1. **部署前检查**: 每次部署前运行 `python deploy_check.py`
2. **自动化部署**: 在部署脚本中添加迁移步骤
3. **版本控制**: 确保迁移文件在版本控制中
4. **测试环境**: 在测试环境先验证迁移

## 部署脚本示例

### 在部署脚本中添加迁移步骤

```bash
#!/bin/bash
# 部署脚本示例

# 1. 拉取代码
git pull

# 2. 安装依赖
pip install -r requirements.txt

# 3. 运行迁移（重要！）
python manage.py migrate --noinput

# 4. 检查数据库结构
python ensure_migrations.py

# 5. 收集静态文件
python manage.py collectstatic --noinput

# 6. 重启服务
systemctl restart your-service
```

### Docker部署示例

```dockerfile
# Dockerfile
FROM python:3.10

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# 在启动时运行迁移
CMD ["sh", "-c", "python manage.py migrate --noinput && python ensure_migrations.py && gunicorn config.wsgi:application"]
```

## 最佳实践

1. **每次部署前运行检查**
   ```bash
   python deploy_check.py
   ```

2. **使用版本控制管理迁移文件**
   - 确保所有迁移文件都在git中
   - 不要手动修改已提交的迁移文件

3. **测试环境验证**
   - 在测试环境先运行迁移
   - 验证数据库结构正确后再部署到生产

4. **定期备份**
   - 在运行迁移前备份数据库
   - 保留迁移前的数据库快照

5. **监控和日志**
   - 记录所有迁移操作
   - 监控数据库结构变化

## 紧急修复

如果生产环境出现数据库结构问题：

1. **立即修复**:
   ```bash
   python fix_database_structure.py
   ```

2. **验证修复**:
   ```bash
   python ensure_migrations.py
   ```

3. **检查服务**:
   ```bash
   python deploy_check.py
   ```

## 联系支持

如果以上方法都无法解决问题，请：
1. 收集错误日志
2. 运行 `python deploy_check.py` 获取详细报告
3. 检查迁移文件历史
4. 联系技术支持









