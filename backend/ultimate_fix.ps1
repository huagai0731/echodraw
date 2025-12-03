# 最终解决方案：使用 sc.exe 修改服务配置
# 必须以管理员身份运行！

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 需要管理员权限！" -ForegroundColor Red
    exit 1
}

Write-Host "最终修复 MySQL skip_networking..." -ForegroundColor Cyan
Write-Host ""

Write-Host "步骤 1: 停止服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "步骤 2: 使用 sc.exe 修改服务配置..." -ForegroundColor Yellow
$newPath = "D:\mysql\bin\mysqld.exe --defaults-file=C:\mysql-8.0.15-winx64\my.ini --skip-networking=0 MySQL"
$result = sc.exe config MySQL binPath= $newPath 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 服务配置已更新" -ForegroundColor Green
} else {
    Write-Host "❌ 更新失败: $result" -ForegroundColor Red
    Write-Host "尝试使用 WMI 方法..." -ForegroundColor Yellow
    
    $service = Get-WmiObject -Class Win32_Service -Filter "Name='MySQL'"
    $result2 = $service.Change($null, $null, $null, $null, $null, $null, $null, "`"$newPath`"", $null, $null, $null)
    if ($result2.ReturnValue -eq 0) {
        Write-Host "✅ 使用 WMI 更新成功" -ForegroundColor Green
    } else {
        Write-Host "❌ WMI 更新也失败: $($result2.ReturnValue)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "步骤 3: 验证服务配置..." -ForegroundColor Yellow
$service = Get-WmiObject win32_service | Where-Object {$_.Name -like "*mysql*"}
Write-Host "服务路径: $($service.PathName)" -ForegroundColor Gray

Write-Host ""
Write-Host "步骤 4: 启动服务..." -ForegroundColor Yellow
Start-Service MySQL
Start-Sleep -Seconds 5

$serviceStatus = Get-Service MySQL
if ($serviceStatus.Status -eq 'Running') {
    Write-Host "✅ MySQL 服务已启动" -ForegroundColor Green
} else {
    Write-Host "❌ MySQL 服务启动失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤 5: 验证 skip_networking..." -ForegroundColor Yellow
$env:MYSQL_PWD = 'huangming0731'
$result = D:\mysql\bin\mysql.exe -u root -e "SHOW VARIABLES LIKE 'skip_networking';" 2>&1
$env:MYSQL_PWD = $null

Write-Host ""
if ($result -match "skip_networking\s+\|\s+OFF") {
    Write-Host "✅✅✅ skip_networking 已设置为 OFF！" -ForegroundColor Green
    Write-Host ""
    Write-Host "现在测试连接..." -ForegroundColor Cyan
    python check_current_database.py
} else {
    Write-Host "❌ skip_networking 仍然是 ON" -ForegroundColor Red
    Write-Host "输出: $result" -ForegroundColor Gray
    Write-Host ""
    Write-Host "如果这个问题持续存在，建议：" -ForegroundColor Yellow
    Write-Host "1. 暂时使用 SQLite（本地开发）" -ForegroundColor Cyan
    Write-Host "2. 或者完全重新安装 MySQL" -ForegroundColor Cyan
    Write-Host "3. 或者使用云端 MySQL 数据库" -ForegroundColor Cyan
}

