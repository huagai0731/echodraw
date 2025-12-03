# 最终修复：使用 D:\mysql\ 的配置（匹配 MySQL 版本）
# 必须以管理员身份运行！

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 需要管理员权限！" -ForegroundColor Red
    exit 1
}

Write-Host "修复 MySQL 配置（使用正确的版本）..." -ForegroundColor Cyan
Write-Host ""

# 使用 D:\mysql\ 的配置（匹配 MySQL 8.0.28）
$configFile = "D:\mysql\my.ini"

Write-Host "步骤 1: 确保 D:\mysql\my.ini 配置正确..." -ForegroundColor Yellow
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
    
    # 确保 datadir 正确
    if ($content -notmatch "datadir=D:\\\\mysql\\\\data") {
        if ($content -match "datadir=") {
            $content = $content -replace "datadir\s*=\s*[^\r\n]+", "datadir=D:\\mysql\\data"
        } else {
            $content = $content -replace "(\[mysqld\])", "`$1`ndatadir=D:\\mysql\\data"
        }
        Set-Content -Path $configFile -Value $content -Encoding UTF8
        Write-Host "✅ 已更新 datadir" -ForegroundColor Green
    }
} else {
    Write-Host "❌ 找不到配置文件: $configFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤 2: 修复数据文件权限..." -ForegroundColor Yellow
$dataDir = "D:\mysql\data"
if (Test-Path $dataDir) {
    # 移除只读属性
    Get-ChildItem $dataDir -Recurse -File | ForEach-Object {
        if ($_.IsReadOnly) {
            $_.IsReadOnly = $false
        }
    }
    Write-Host "✅ 数据文件权限已修复" -ForegroundColor Green
} else {
    Write-Host "⚠️  数据目录不存在: $dataDir" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "步骤 3: 停止并删除服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
sc.exe delete MySQL 2>&1 | Out-Null
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "步骤 4: 重新安装服务（使用 D:\mysql\my.ini）..." -ForegroundColor Yellow
Push-Location "D:\mysql\bin"
$result = & .\mysqld.exe --install MySQL --defaults-file="$configFile" 2>&1
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 安装失败: $result" -ForegroundColor Red
    exit 1
}
Write-Host "✅ 服务安装成功" -ForegroundColor Green

Write-Host ""
Write-Host "步骤 5: 启动服务..." -ForegroundColor Yellow
Start-Service MySQL
Start-Sleep -Seconds 5

$service = Get-Service MySQL
if ($service.Status -eq 'Running') {
    Write-Host "✅ MySQL 服务已启动" -ForegroundColor Green
} else {
    Write-Host "❌ MySQL 服务启动失败，状态: $($service.Status)" -ForegroundColor Red
    Write-Host "请检查错误日志: D:\mysql\data\*.err" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "步骤 6: 验证配置..." -ForegroundColor Yellow
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
}

