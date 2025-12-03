# 启动 MySQL 服务的脚本
# 需要以管理员身份运行

Write-Host "正在启动 MySQL 服务..." -ForegroundColor Yellow

try {
    Start-Service mysql
    Start-Sleep -Seconds 3
    
    $service = Get-Service mysql
    if ($service.Status -eq 'Running') {
        Write-Host "✅ MySQL 服务已成功启动！" -ForegroundColor Green
    } else {
        Write-Host "❌ MySQL 服务启动失败，当前状态: $($service.Status)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 启动失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "请尝试以下方法:" -ForegroundColor Yellow
    Write-Host "1. 以管理员身份运行此脚本" -ForegroundColor Yellow
    Write-Host "2. 或者在服务管理器中手动启动 MySQL 服务" -ForegroundColor Yellow
    Write-Host "   - 按 Win+R，输入 services.msc" -ForegroundColor Yellow
    Write-Host "   - 找到 MySQL 服务，右键点击启动" -ForegroundColor Yellow
}

