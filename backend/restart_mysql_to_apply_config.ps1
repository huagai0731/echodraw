# 重启 MySQL 服务以应用配置
# 必须以管理员身份运行！

Write-Host "重启 MySQL 服务以应用配置..." -ForegroundColor Yellow

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 错误: 请以管理员身份运行此脚本！" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 已检测到管理员权限" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 1: 停止 MySQL 服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force
Start-Sleep -Seconds 2

Write-Host "步骤 2: 启动 MySQL 服务..." -ForegroundColor Yellow
Start-Service MySQL
Start-Sleep -Seconds 5

Write-Host "步骤 3: 检查服务状态..." -ForegroundColor Yellow
$service = Get-Service MySQL
if ($service.Status -eq 'Running') {
    Write-Host "✅ MySQL 服务正在运行" -ForegroundColor Green
} else {
    Write-Host "❌ MySQL 服务未运行，状态: $($service.Status)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤 4: 验证 skip_networking 设置..." -ForegroundColor Yellow
$env:MYSQL_PWD = 'huangming0731'
$result = D:\mysql\bin\mysql.exe -u root -e "SHOW VARIABLES LIKE 'skip_networking';" 2>&1
$env:MYSQL_PWD = $null

if ($result -match "skip_networking\s+OFF") {
    Write-Host "✅ skip_networking 已设置为 OFF" -ForegroundColor Green
} else {
    Write-Host "⚠️  skip_networking 仍然是 ON" -ForegroundColor Yellow
    Write-Host "可能需要检查配置文件: D:\mysql\my.ini" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "完成！现在可以测试连接了:" -ForegroundColor Green
Write-Host "  python check_current_database.py" -ForegroundColor Cyan

