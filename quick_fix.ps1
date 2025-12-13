# 快速修复脚本 - 必须以管理员身份运行
$serverIP = "115.190.238.247"

Write-Host "删除到 $serverIP 的路由..." -ForegroundColor Cyan

# 方法1: 使用Remove-NetRoute
Get-NetRoute -DestinationPrefix "$serverIP/32" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-NetRoute -DestinationPrefix "$serverIP/32" -NextHop $_.NextHop -InterfaceIndex $_.InterfaceIndex -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "已删除路由: $($_.NextHop)" -ForegroundColor Green
}

# 方法2: 使用route命令
$null = route delete $serverIP 2>&1

# 验证
Start-Sleep -Seconds 1
$remaining = route print | Select-String $serverIP
if ($remaining) {
    Write-Host "仍有路由存在，尝试强制删除..." -ForegroundColor Yellow
    route delete $serverIP
} else {
    Write-Host "✓ 路由已清除" -ForegroundColor Green
}

Write-Host "`n测试连通性..." -ForegroundColor Cyan
Test-Connection -ComputerName $serverIP -Count 2

