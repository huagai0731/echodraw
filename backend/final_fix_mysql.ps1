# 最终修复：使用正确的配置文件重新安装服务
# 必须以管理员身份运行！

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 需要管理员权限！" -ForegroundColor Red
    exit 1
}

Write-Host "最终修复 MySQL 配置..." -ForegroundColor Cyan
Write-Host ""

# 使用 MySQL 实际读取的配置文件
$configFile = "C:\mysql-8.0.15-winx64\my.ini"

Write-Host "步骤 1: 确保配置文件正确..." -ForegroundColor Yellow
if (Test-Path $configFile) {
    $content = Get-Content $configFile -Raw
    if ($content -notmatch "skip-networking=OFF") {
        if ($content -match "skip-networking") {
            $content = $content -replace "skip-networking\s*=\s*\w+", "skip-networking=OFF"
        } else {
            $content = $content -replace "(\[mysqld\])", "`$1`nskip-networking=OFF"
        }
        Set-Content -Path $configFile -Value $content -Encoding UTF8
        Write-Host "✅ 已更新配置文件" -ForegroundColor Green
    } else {
        Write-Host "✅ 配置文件已正确" -ForegroundColor Green
    }
} else {
    Write-Host "❌ 找不到配置文件: $configFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤 2: 停止并删除服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
sc.exe delete MySQL 2>&1 | Out-Null
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "步骤 3: 重新安装服务（使用正确的配置文件）..." -ForegroundColor Yellow
Push-Location "D:\mysql\bin"
$result = & .\mysqld.exe --install MySQL --defaults-file="$configFile" 2>&1
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 安装失败: $result" -ForegroundColor Red
    exit 1
}
Write-Host "✅ 服务安装成功" -ForegroundColor Green

Write-Host ""
Write-Host "步骤 4: 启动服务..." -ForegroundColor Yellow
Start-Service MySQL
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "步骤 5: 验证配置..." -ForegroundColor Yellow
$env:MYSQL_PWD = 'huangming0731'
$result = D:\mysql\bin\mysql.exe -u root -e "SHOW VARIABLES LIKE 'skip_networking'; SHOW VARIABLES LIKE 'basedir';" 2>&1
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
}

