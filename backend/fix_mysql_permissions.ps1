# 修复 MySQL 数据目录权限的脚本
# 需要以管理员身份运行

Write-Host "正在修复 MySQL 数据目录权限..." -ForegroundColor Yellow

$dataDir = "D:\mysql\data"

if (-not (Test-Path $dataDir)) {
    Write-Host "错误: 数据目录不存在: $dataDir" -ForegroundColor Red
    exit 1
}

try {
    # 修复文件夹权限
    Write-Host "修复文件夹权限..." -ForegroundColor Yellow
    $acl = Get-Acl $dataDir
    $permission = "$env:USERNAME","FullControl","ContainerInherit,ObjectInherit","None","Allow"
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
    $acl.SetAccessRule($accessRule)
    Set-Acl $dataDir $acl
    Write-Host "✅ 文件夹权限已修复" -ForegroundColor Green
    
    # 修复数据文件只读属性
    Write-Host "修复数据文件只读属性..." -ForegroundColor Yellow
    $files = Get-ChildItem $dataDir -Filter "ibdata*" -ErrorAction SilentlyContinue
    if ($files) {
        $files | ForEach-Object {
            if ($_.IsReadOnly) {
                $_.IsReadOnly = $false
                Write-Host "  ✅ 已移除 $($_.Name) 的只读属性" -ForegroundColor Green
            }
        }
    }
    
    # 修复所有 .ibd 文件
    Write-Host "修复 .ibd 文件..." -ForegroundColor Yellow
    Get-ChildItem $dataDir -Filter "*.ibd" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.IsReadOnly) {
            $_.IsReadOnly = $false
        }
    }
    
    Write-Host ""
    Write-Host "✅ 权限修复完成！" -ForegroundColor Green
    Write-Host ""
    Write-Host "现在可以尝试启动 MySQL:" -ForegroundColor Yellow
    Write-Host "  方法1: Start-Service mysql (需要管理员权限)" -ForegroundColor Cyan
    Write-Host "  方法2: cd D:\mysql\bin; .\mysqld.exe --console" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ 修复失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "请手动修复权限:" -ForegroundColor Yellow
    Write-Host "1. 右键点击 D:\mysql\data 文件夹" -ForegroundColor Cyan
    Write-Host "2. 选择'属性' → '安全'" -ForegroundColor Cyan
    Write-Host "3. 确保你的用户有'完全控制'权限" -ForegroundColor Cyan
}

