# 重新安装 MySQL 服务的脚本
# 必须以管理员身份运行！

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MySQL 服务重新安装脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 错误: 请以管理员身份运行此脚本！" -ForegroundColor Red
    Write-Host "右键点击 PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 已检测到管理员权限" -ForegroundColor Green
Write-Host ""

# MySQL 路径
$mysqlBin = "D:\mysql\bin"
$mysqlIni = "D:\mysql\my.ini"

# 检查路径
if (-not (Test-Path "$mysqlBin\mysqld.exe")) {
    Write-Host "❌ 错误: 找不到 MySQL: $mysqlBin\mysqld.exe" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $mysqlIni)) {
    Write-Host "❌ 错误: 找不到配置文件: $mysqlIni" -ForegroundColor Red
    exit 1
}

Write-Host "步骤 1: 停止 MySQL 服务..." -ForegroundColor Yellow
try {
    Stop-Service mysql -Force -ErrorAction Stop
    Write-Host "✅ MySQL 服务已停止" -ForegroundColor Green
} catch {
    Write-Host "⚠️  服务可能已经停止或不存在" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "步骤 2: 删除旧服务..." -ForegroundColor Yellow
$result = sc.exe delete mysql 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 旧服务已删除" -ForegroundColor Green
} else {
    Write-Host "⚠️  删除服务时出现警告（可能服务不存在）" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "步骤 3: 等待服务完全删除..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "步骤 4: 重新安装 MySQL 服务..." -ForegroundColor Yellow
Push-Location $mysqlBin
try {
    $installResult = & .\mysqld.exe --install MySQL --defaults-file=$mysqlIni 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ MySQL 服务安装成功！" -ForegroundColor Green
    } else {
        Write-Host "❌ 安装失败: $installResult" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} catch {
    Write-Host "❌ 安装失败: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "步骤 5: 启动 MySQL 服务..." -ForegroundColor Yellow
try {
    Start-Service mysql -ErrorAction Stop
    Start-Sleep -Seconds 3
    
    $service = Get-Service mysql
    if ($service.Status -eq 'Running') {
        Write-Host "✅ MySQL 服务已成功启动！" -ForegroundColor Green
        Write-Host ""
        Write-Host "现在可以测试连接了:" -ForegroundColor Yellow
        Write-Host "  cd C:\Users\gai\Desktop\echo\backend" -ForegroundColor Cyan
        Write-Host "  python check_current_database.py" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  MySQL 服务状态: $($service.Status)" -ForegroundColor Yellow
        Write-Host "请检查错误日志: D:\mysql\data\*.err" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ 启动失败: $_" -ForegroundColor Red
    Write-Host "请检查错误日志: D:\mysql\data\*.err" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "完成！" -ForegroundColor Green

