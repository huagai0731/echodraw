# 强制在服务启动参数中添加 --skip-networking=0
# 必须以管理员身份运行！

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 需要管理员权限！" -ForegroundColor Red
    exit 1
}

Write-Host "强制修改 MySQL 服务启动参数..." -ForegroundColor Cyan
Write-Host ""

Write-Host "步骤 1: 停止服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force
Start-Sleep -Seconds 2

Write-Host "步骤 2: 获取当前服务配置..." -ForegroundColor Yellow
$service = Get-WmiObject -Class Win32_Service -Filter "Name='MySQL'"
if (-not $service) {
    Write-Host "❌ 找不到 MySQL 服务" -ForegroundColor Red
    exit 1
}

$currentPath = $service.PathName
Write-Host "当前路径: $currentPath" -ForegroundColor Gray

Write-Host ""
Write-Host "步骤 3: 修改服务路径，添加 --skip-networking=0..." -ForegroundColor Yellow

# 提取可执行文件路径和参数
if ($currentPath -match '^"?(.+?mysqld\.exe)"?\s+(.+)$') {
    $exePath = $matches[1]
    $args = $matches[2]
    
    # 如果参数中没有 --skip-networking=0，添加它
    if ($args -notmatch "--skip-networking=0") {
        # 移除可能存在的 --skip-networking=1 或 --skip-networking
        $args = $args -replace "--skip-networking(=1)?\s*", ""
        # 添加 --skip-networking=0
        $newArgs = $args.Trim() + " --skip-networking=0"
        $newPath = "`"$exePath`" $newArgs"
        
        Write-Host "新路径: $newPath" -ForegroundColor Gray
        
        # 修改服务
        $result = $service.Change($null, $null, $null, $null, $null, $null, $null, $newPath, $null, $null, $null)
        if ($result.ReturnValue -eq 0) {
            Write-Host "✅ 服务配置已更新" -ForegroundColor Green
        } else {
            Write-Host "❌ 更新失败，错误代码: $($result.ReturnValue)" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✅ 服务已包含 --skip-networking=0" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  无法解析服务路径，尝试直接添加参数..." -ForegroundColor Yellow
    $newPath = $currentPath.Trim() + " --skip-networking=0"
    $result = $service.Change($null, $null, $null, $null, $null, $null, $null, $newPath, $null, $null, $null)
    if ($result.ReturnValue -eq 0) {
        Write-Host "✅ 服务配置已更新" -ForegroundColor Green
    } else {
        Write-Host "❌ 更新失败" -ForegroundColor Red
        exit 1
    }
}

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
    Write-Host "⚠️  skip_networking 仍然是 ON" -ForegroundColor Yellow
    Write-Host "输出: $result" -ForegroundColor Gray
    Write-Host ""
    Write-Host "可能需要检查是否有其他配置文件覆盖了设置" -ForegroundColor Yellow
}

