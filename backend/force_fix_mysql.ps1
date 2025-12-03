# 强制修复 MySQL skip_networking 问题
# 必须以管理员身份运行！

Write-Host "强制修复 MySQL 网络连接..." -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 需要管理员权限！" -ForegroundColor Red
    exit 1
}

Write-Host "步骤 1: 停止 MySQL 服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force
Start-Sleep -Seconds 2

Write-Host "步骤 2: 删除旧服务..." -ForegroundColor Yellow
sc.exe delete MySQL 2>&1 | Out-Null
Start-Sleep -Seconds 2

Write-Host "步骤 3: 修改配置文件，确保 skip-networking=OFF..." -ForegroundColor Yellow
$configFile = "C:\mysql-8.0.15-winx64\my.ini"
if (Test-Path $configFile) {
    $content = Get-Content $configFile -Raw
    # 确保 skip-networking=OFF
    if ($content -match "skip-networking") {
        $content = $content -replace "skip-networking\s*=\s*\w+", "skip-networking=OFF"
    } else {
        # 在 [mysqld] 部分添加
        $content = $content -replace "(\[mysqld\])", "`$1`nskip-networking=OFF"
    }
    Set-Content -Path $configFile -Value $content -Encoding UTF8
    Write-Host "✅ 配置文件已更新" -ForegroundColor Green
}

Write-Host "步骤 4: 重新安装服务，添加 --skip-networking=0 参数..." -ForegroundColor Yellow
Push-Location "D:\mysql\bin"
$result = & .\mysqld.exe --install MySQL --defaults-file="C:\mysql-8.0.15-winx64\my.ini" 2>&1
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 安装失败: $result" -ForegroundColor Red
    exit 1
}

Write-Host "步骤 5: 修改服务启动参数，强制关闭 skip_networking..." -ForegroundColor Yellow
# 修改服务配置，添加启动参数
$service = Get-WmiObject -Class Win32_Service -Filter "Name='MySQL'"
if ($service) {
    $servicePath = $service.PathName
    # 如果路径中没有 --skip-networking=0，添加它
    if ($servicePath -notmatch "--skip-networking=0") {
        $newPath = $servicePath -replace "(--defaults-file=[^\s]+)", "`$1 --skip-networking=0"
        $service.Change($null, $null, $null, $null, $null, $null, $null, $newPath, $null, $null, $null)
        Write-Host "✅ 服务启动参数已更新" -ForegroundColor Green
    }
}

Write-Host "步骤 6: 启动 MySQL 服务..." -ForegroundColor Yellow
Start-Service MySQL
Start-Sleep -Seconds 5

Write-Host "步骤 7: 验证..." -ForegroundColor Yellow
$env:MYSQL_PWD = 'huangming0731'
$result = D:\mysql\bin\mysql.exe -u root -e "SHOW VARIABLES LIKE 'skip_networking';" 2>&1
$env:MYSQL_PWD = $null

if ($result -match "skip_networking\s+\|\s+OFF") {
    Write-Host "✅ skip_networking 已设置为 OFF！" -ForegroundColor Green
    Write-Host ""
    Write-Host "现在可以测试连接了:" -ForegroundColor Cyan
    Write-Host "  python check_current_database.py" -ForegroundColor Yellow
} else {
    Write-Host "⚠️  skip_networking 仍然是 ON" -ForegroundColor Yellow
    Write-Host "可能需要手动检查配置文件" -ForegroundColor Yellow
}

