# 重置网络路由配置
# 需要以管理员身份运行

$ErrorActionPreference = "Continue"

Write-Host "=== 重置网络路由配置 ===" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误: 需要以管理员身份运行此脚本！" -ForegroundColor Red
    Write-Host "请右键点击PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    pause
    exit 1
}

$serverIP = "115.190.238.247"

Write-Host "[1/5] 删除到 $serverIP 的所有自定义路由..." -ForegroundColor Cyan

# 删除所有到该IP的路由
$routes = Get-NetRoute -DestinationPrefix "$serverIP/32" -ErrorAction SilentlyContinue
if ($routes) {
    foreach ($route in $routes) {
        try {
            Remove-NetRoute -DestinationPrefix "$serverIP/32" -NextHop $route.NextHop -InterfaceIndex $route.InterfaceIndex -Confirm:$false -ErrorAction Stop
            Write-Host "✓ 已删除路由: $($route.NextHop)" -ForegroundColor Green
        } catch {
            Write-Host "✗ 删除路由失败: $_" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "未找到自定义路由" -ForegroundColor Gray
}

# 使用route命令再次尝试删除
Write-Host "`n[2/5] 使用route命令清理..." -ForegroundColor Cyan
$process = Start-Process -FilePath "route" -ArgumentList "delete", $serverIP -NoNewWindow -Wait -PassThru
Start-Sleep -Seconds 1

Write-Host "`n[3/5] 刷新DNS缓存..." -ForegroundColor Cyan
ipconfig /flushdns | Out-Null
Write-Host "✓ DNS缓存已刷新" -ForegroundColor Green

Write-Host "`n[4/5] 重置网络适配器状态..." -ForegroundColor Cyan
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.InterfaceDescription -notlike "*VPN*" -and $_.InterfaceDescription -notlike "*TAP*" }
if ($adapters) {
    foreach ($adapter in $adapters) {
        try {
            Write-Host "刷新适配器: $($adapter.Name)" -ForegroundColor Gray
            Restart-NetAdapter -Name $adapter.Name -Confirm:$false -ErrorAction Stop
            Write-Host "✓ $($adapter.Name) 已刷新" -ForegroundColor Green
        } catch {
            Write-Host "✗ 刷新失败: $_" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n[5/5] 测试服务器连通性..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

$pingResult = Test-Connection -ComputerName $serverIP -Count 4 -Quiet
if ($pingResult) {
    Write-Host "✓ 服务器现在可以访问了！" -ForegroundColor Green
} else {
    Write-Host "✗ 仍然无法连接" -ForegroundColor Red
    Write-Host "`n尝试其他修复方法..." -ForegroundColor Yellow
    
    Write-Host "`n检查路由表..." -ForegroundColor Cyan
    $allRoutes = Get-NetRoute | Where-Object { $_.DestinationPrefix -like "*$serverIP*" }
    if ($allRoutes) {
        Write-Host "仍然存在相关路由:" -ForegroundColor Yellow
        $allRoutes | Format-Table DestinationPrefix, NextHop, InterfaceAlias, RouteMetric
    } else {
        Write-Host "路由表中无相关路由" -ForegroundColor Gray
    }
    
    Write-Host "`n检查默认路由..." -ForegroundColor Cyan
    $defaultRoutes = Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Sort-Object RouteMetric | Select-Object -First 3
    $defaultRoutes | Format-Table DestinationPrefix, NextHop, InterfaceAlias, RouteMetric
    
    Write-Host "`n如果仍无法连接，请检查:" -ForegroundColor Yellow
    Write-Host "1. 云服务器是否正常运行" -ForegroundColor White
    Write-Host "2. 云服务商安全组是否开放相应端口" -ForegroundColor White
    Write-Host "3. 服务器防火墙是否阻止了连接" -ForegroundColor White
    Write-Host "4. 尝试重启电脑" -ForegroundColor White
}

Write-Host "`n按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

