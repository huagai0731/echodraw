# 修复 MySQL 配置路径问题
# 必须以管理员身份运行！

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "修复 MySQL 配置路径" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 错误: 请以管理员身份运行此脚本！" -ForegroundColor Red
    exit 1
}

Write-Host "问题: MySQL 正在使用错误的路径 (C:\mysql-8.0.15-winx64\)" -ForegroundColor Yellow
Write-Host "实际安装路径: D:\mysql\" -ForegroundColor Yellow
Write-Host ""

# 检查旧路径的配置文件
$oldConfig = "C:\mysql-8.0.15-winx64\my.ini"
$newConfig = "D:\mysql\my.ini"

if (Test-Path $oldConfig) {
    Write-Host "步骤 1: 修改旧路径的配置文件..." -ForegroundColor Yellow
    $content = Get-Content $oldConfig -Raw
    if ($content -notmatch "skip-networking=OFF") {
        # 添加或修改 skip-networking
        if ($content -match "skip-networking") {
            $content = $content -replace "skip-networking\s*=\s*\w+", "skip-networking=OFF"
        } else {
            # 在 [mysqld] 部分添加
            if ($content -match "\[mysqld\]") {
                $content = $content -replace "(\[mysqld\])", "`$1`nskip-networking=OFF"
            }
        }
        Set-Content -Path $oldConfig -Value $content -Encoding UTF8
        Write-Host "✅ 已更新 $oldConfig" -ForegroundColor Green
    } else {
        Write-Host "✅ $oldConfig 已包含 skip-networking=OFF" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  未找到 $oldConfig" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "步骤 2: 重新安装 MySQL 服务（使用正确的路径）..." -ForegroundColor Yellow

# 停止并删除旧服务
Write-Host "  停止 MySQL 服务..." -ForegroundColor Gray
Stop-Service MySQL -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "  删除旧服务..." -ForegroundColor Gray
sc.exe delete MySQL 2>&1 | Out-Null
Start-Sleep -Seconds 2

# 重新安装服务，明确指定配置文件
Write-Host "  重新安装服务..." -ForegroundColor Gray
Push-Location "D:\mysql\bin"
$result = & .\mysqld.exe --install MySQL --defaults-file="D:\mysql\my.ini" 2>&1
Pop-Location

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 服务安装成功" -ForegroundColor Green
} else {
    Write-Host "❌ 服务安装失败: $result" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤 3: 启动 MySQL 服务..." -ForegroundColor Yellow
Start-Service MySQL
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "步骤 4: 验证配置..." -ForegroundColor Yellow
$env:MYSQL_PWD = 'huangming0731'
$result = D:\mysql\bin\mysql.exe -u root -e "SHOW VARIABLES LIKE 'basedir'; SHOW VARIABLES LIKE 'skip_networking';" 2>&1
$env:MYSQL_PWD = $null

if ($result -match "basedir\s+\|\s+D:\\mysql") {
    Write-Host "✅ basedir 已更新为 D:\mysql" -ForegroundColor Green
} else {
    Write-Host "⚠️  basedir 可能仍然是旧路径" -ForegroundColor Yellow
}

if ($result -match "skip_networking\s+\|\s+OFF") {
    Write-Host "✅ skip_networking 已设置为 OFF" -ForegroundColor Green
} else {
    Write-Host "⚠️  skip_networking 可能仍然是 ON" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "完成！现在可以测试连接了:" -ForegroundColor Green
Write-Host "  python check_current_database.py" -ForegroundColor Cyan

