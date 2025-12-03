# MySQL 重启脚本
# 如果普通权限无法重启，请以管理员身份运行此脚本

Write-Host "正在重启 MySQL 服务..." -ForegroundColor Yellow

# 方法 1: 尝试通过服务重启
try {
    Restart-Service mysql -ErrorAction Stop
    Write-Host "✅ MySQL 服务已通过服务管理器重启！" -ForegroundColor Green
} catch {
    Write-Host "⚠️  无法通过服务重启，尝试手动方式..." -ForegroundColor Yellow
    
    # 方法 2: 手动停止进程然后启动服务
    $mysqldProcess = Get-Process -Name mysqld -ErrorAction SilentlyContinue
    if ($mysqldProcess) {
        Write-Host "正在停止 MySQL 进程..." -ForegroundColor Yellow
        Stop-Process -Name mysqld -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    # 尝试启动服务
    try {
        Start-Service mysql -ErrorAction Stop
        Write-Host "✅ MySQL 服务已启动！" -ForegroundColor Green
    } catch {
        Write-Host "❌ 无法启动服务，可能需要管理员权限" -ForegroundColor Red
        Write-Host ""
        Write-Host "请尝试以下方法之一:" -ForegroundColor Yellow
        Write-Host "1. 以管理员身份运行此脚本" -ForegroundColor Cyan
        Write-Host "2. 使用服务管理器手动重启:" -ForegroundColor Cyan
        Write-Host "   - 按 Win+R，输入 services.msc" -ForegroundColor Cyan
        Write-Host "   - 找到 MySQL 服务，右键点击重启" -ForegroundColor Cyan
        Write-Host "3. 或者直接启动 MySQL:" -ForegroundColor Cyan
        Write-Host "   cd D:\mysql\bin" -ForegroundColor Cyan
        Write-Host "   .\mysqld.exe --console" -ForegroundColor Cyan
    }
}

# 等待服务启动
Start-Sleep -Seconds 3

# 检查服务状态
$service = Get-Service mysql -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -eq 'Running') {
        Write-Host ""
        Write-Host "✅ MySQL 服务正在运行！" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "⚠️  MySQL 服务状态: $($service.Status)" -ForegroundColor Yellow
    }
} else {
    # 检查进程
    $process = Get-Process -Name mysqld -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host ""
        Write-Host "✅ MySQL 进程正在运行（可能不是通过服务启动）" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ MySQL 未运行" -ForegroundColor Red
    }
}

