# 修复VPN导致的网络连接问题
# 需要以管理员身份运行

$ErrorActionPreference = "Continue"

Write-Host "=== 网络诊断和修复工具 ===" -ForegroundColor Cyan
Write-Host "目标服务器: 115.190.238.247" -ForegroundColor Yellow
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误: 需要以管理员身份运行此脚本！" -ForegroundColor Red
    Write-Host "请右键点击PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    pause
    exit 1
}

# 步骤1: 检查当前连接
Write-Host "[1/6] 测试服务器连通性..." -ForegroundColor Cyan
$pingResult = Test-Connection -ComputerName 115.190.238.247 -Count 2 -Quiet
if ($pingResult) {
    Write-Host "✓ Ping测试成功" -ForegroundColor Green
} else {
    Write-Host "✗ Ping测试失败" -ForegroundColor Red
}

# 步骤2: 检查路由表
Write-Host "`n[2/6] 检查路由表..." -ForegroundColor Cyan
$routes = Get-NetRoute | Where-Object { $_.DestinationPrefix -eq "0.0.0.0/0" }
Write-Host "默认路由 (0.0.0.0/0):"
foreach ($route in $routes) {
    Write-Host "  接口: $($route.InterfaceAlias), 下一跳: $($route.NextHop), 跃点数: $($route.RouteMetric)"
}

# 检查是否有到服务器的路由
$serverRoute = Get-NetRoute -DestinationPrefix "115.190.238.247/32" -ErrorAction SilentlyContinue
if ($serverRoute) {
    Write-Host "`n找到到服务器的路由:" -ForegroundColor Yellow
    Write-Host "  接口: $($serverRoute.InterfaceAlias), 下一跳: $($serverRoute.NextHop)"
}

# 步骤3: 获取默认网关
Write-Host "`n[3/6] 查找默认网关..." -ForegroundColor Cyan
$defaultGateway = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Where-Object { $_.RouteMetric -eq (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Measure-Object -Property RouteMetric -Minimum).Minimum } | Select-Object -First 1).NextHop

# 获取活动网络适配器（非VPN）
$activeAdapter = Get-NetAdapter | Where-Object { 
    $_.Status -eq "Up" -and 
    $_.InterfaceDescription -notlike "*VPN*" -and 
    $_.InterfaceDescription -notlike "*TAP*" -and
    $_.InterfaceDescription -notlike "*OpenVPN*"
} | Select-Object -First 1

if ($activeAdapter) {
    Write-Host "活动网络适配器: $($activeAdapter.Name) ($($activeAdapter.InterfaceDescription))" -ForegroundColor Green
    
    # 获取该适配器的网关
    $adapterGateway = (Get-NetRoute -InterfaceIndex $activeAdapter.ifIndex -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Select-Object -First 1).NextHop
    if ($adapterGateway) {
        $defaultGateway = $adapterGateway
        Write-Host "网关地址: $defaultGateway" -ForegroundColor Green
    }
} else {
    Write-Host "警告: 未找到活动网络适配器" -ForegroundColor Yellow
}

# 步骤4: 检查VPN适配器
Write-Host "`n[4/6] 检查VPN连接..." -ForegroundColor Cyan
$vpnAdapters = Get-NetAdapter | Where-Object { 
    $_.InterfaceDescription -like "*VPN*" -or 
    $_.InterfaceDescription -like "*TAP*" -or
    $_.InterfaceDescription -like "*OpenVPN*" -or
    $_.InterfaceDescription -like "*WireGuard*"
}

if ($vpnAdapters) {
    Write-Host "发现VPN适配器:" -ForegroundColor Yellow
    foreach ($vpn in $vpnAdapters) {
        Write-Host "  - $($vpn.Name) ($($vpn.InterfaceDescription)) - 状态: $($vpn.Status)" -ForegroundColor Yellow
    }
} else {
    Write-Host "未发现VPN适配器" -ForegroundColor Green
}

# 步骤5: 修复路由
Write-Host "`n[5/6] 尝试修复路由..." -ForegroundColor Cyan
if ($defaultGateway) {
    # 删除可能存在的旧路由
    Remove-NetRoute -DestinationPrefix "115.190.238.247/32" -Confirm:$false -ErrorAction SilentlyContinue
    
    # 添加新路由，强制走默认网关
    try {
        $route = New-NetRoute -DestinationPrefix "115.190.238.247/32" -NextHop $defaultGateway -InterfaceIndex $activeAdapter.ifIndex -RouteMetric 1 -ErrorAction Stop
        Write-Host "✓ 成功添加路由: 115.190.238.247 -> $defaultGateway" -ForegroundColor Green
        Write-Host "  路由已设置为永久（重启后仍然有效）" -ForegroundColor Gray
    } catch {
        Write-Host "✗ 添加路由失败: $_" -ForegroundColor Red
        Write-Host "尝试使用route命令..." -ForegroundColor Yellow
        
        # 备用方法：使用route命令
        $process = Start-Process -FilePath "route" -ArgumentList "delete", "115.190.238.247" -NoNewWindow -Wait -PassThru
        $process = Start-Process -FilePath "route" -ArgumentList "add", "115.190.238.247", "mask", "255.255.255.255", $defaultGateway, "metric", "1", "-p" -NoNewWindow -Wait -PassThru -Verb RunAs
        if ($process.ExitCode -eq 0) {
            Write-Host "✓ 使用route命令成功添加路由" -ForegroundColor Green
        } else {
            Write-Host "✗ route命令也失败了" -ForegroundColor Red
        }
    }
} else {
    Write-Host "✗ 无法确定默认网关，跳过路由修复" -ForegroundColor Red
}

# 步骤6: 验证修复
Write-Host "`n[6/6] 验证修复结果..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

$pingTest = Test-Connection -ComputerName 115.190.238.247 -Count 3 -Quiet
if ($pingTest) {
    Write-Host "✓ 修复成功！服务器现在可以访问了" -ForegroundColor Green
} else {
    Write-Host "✗ 修复后仍无法连接" -ForegroundColor Red
    Write-Host "`n可能的原因:" -ForegroundColor Yellow
    Write-Host "1. 服务器端防火墙阻止了连接" -ForegroundColor White
    Write-Host "2. 云服务商安全组未开放相应端口" -ForegroundColor White
    Write-Host "3. 需要断开VPN连接" -ForegroundColor White
    Write-Host "4. 网络适配器需要重启" -ForegroundColor White
}

# 额外建议
Write-Host "`n=== 其他建议 ===" -ForegroundColor Cyan
Write-Host "如果问题仍然存在，请尝试:" -ForegroundColor Yellow
Write-Host "1. 完全断开VPN连接" -ForegroundColor White
Write-Host "2. 运行: netsh winsock reset  (需要重启)" -ForegroundColor White
Write-Host "3. 检查VPN客户端的'分流'或'路由分离'设置" -ForegroundColor White
Write-Host "4. 将服务器IP添加到VPN的排除列表" -ForegroundColor White

Write-Host "`n按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

