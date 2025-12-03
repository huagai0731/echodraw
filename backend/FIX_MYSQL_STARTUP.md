# 修复 MySQL 启动错误

## 当前错误

你遇到了以下问题：
1. MySQL 在寻找错误的路径：`C:\mysql-8.0.15-winx64`（但实际安装路径是 `D:\mysql`）
2. 数据文件 `ibdata1` 不可写（权限问题）

## 已完成的修复

✅ 已在 `my.ini` 中添加 `datadir=D:\\mysql\\data` 配置

## 需要手动修复的步骤

### 步骤 1: 修复数据文件权限

1. **找到数据文件**
   - 打开 `D:\mysql\data` 文件夹
   - 找到 `ibdata1` 文件

2. **修改文件权限**
   - 右键点击 `ibdata1` 文件
   - 选择"属性"
   - 取消勾选"只读"
   - 点击"确定"

3. **修改文件夹权限（如果需要）**
   - 右键点击 `D:\mysql\data` 文件夹
   - 选择"属性" → "安全" 标签
   - 确保你的用户有"完全控制"权限
   - 如果没有，点击"编辑"，添加你的用户并给予完全控制权限

### 步骤 2: 检查是否有路径硬编码

MySQL 可能在注册表或其他地方保存了旧路径。检查：

1. **检查注册表**（可选，高级用户）
   - 按 `Win + R`，输入 `regedit`
   - 搜索 `C:\mysql-8.0.15-winx64`
   - 如果找到，将其改为 `D:\mysql`

2. **或者重新安装 MySQL 服务**（如果上述方法不行）

### 步骤 3: 重新启动 MySQL

修复权限后，尝试以下方法之一：

**方法 A: 通过服务启动**（推荐）
```powershell
# 以管理员身份运行
Start-Service mysql
```

**方法 B: 直接启动**
```powershell
cd D:\mysql\bin
.\mysqld.exe --console
```

## 快速修复脚本

我已经创建了一个 PowerShell 脚本来修复权限问题。以管理员身份运行：

```powershell
# 修复数据目录权限
$dataDir = "D:\mysql\data"
$acl = Get-Acl $dataDir
$permission = "$env:USERNAME","FullControl","ContainerInherit,ObjectInherit","None","Allow"
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
$acl.SetAccessRule($accessRule)
Set-Acl $dataDir $acl

# 修复数据文件权限
Get-ChildItem $dataDir -Filter "ibdata*" | ForEach-Object {
    $_.IsReadOnly = $false
}

Write-Host "权限已修复！" -ForegroundColor Green
```

## 如果仍然无法启动

如果修复权限后仍然有问题，可能需要：

1. **检查 MySQL 版本兼容性**
   - 错误信息显示 MySQL 8.0.28，但某些文件来自 8.0.15
   - 可能需要重新安装或升级 MySQL

2. **使用服务方式启动**（而不是直接运行 mysqld.exe）
   - 通过 Windows 服务管理器启动通常更稳定

3. **检查日志**
   - 查看 `D:\mysql\data\*.err` 文件获取详细错误信息

