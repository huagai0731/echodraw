# 简单的 MySQL 密码重置脚本（服务运行时）
# 需要以管理员身份运行

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MySQL 密码重置（服务运行时）" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 错误: 请以管理员身份运行此脚本！" -ForegroundColor Red
    exit 1
}

# MySQL 路径
$mysqlBin = "D:\mysql\bin"
$mysqlExe = Join-Path $mysqlBin "mysql.exe"
$mysqldExe = Join-Path $mysqlBin "mysqld.exe"

# 检查 MySQL 服务状态
$service = Get-Service MySQL -ErrorAction SilentlyContinue
if ($service.Status -ne 'Running') {
    Write-Host "❌ MySQL 服务未运行，请先启动服务" -ForegroundColor Red
    exit 1
}

Write-Host "✅ MySQL 服务正在运行" -ForegroundColor Green
Write-Host ""

Write-Host "请输入新密码（将用于 root 用户）:" -ForegroundColor Yellow
$newPassword = Read-Host -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPassword))

if ([string]::IsNullOrWhiteSpace($passwordPlain)) {
    Write-Host "❌ 密码不能为空！" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤 1: 停止 MySQL 服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force
Start-Sleep -Seconds 2

Write-Host "步骤 2: 以跳过权限表模式启动 MySQL..." -ForegroundColor Yellow
$mysqldProcess = Start-Process -FilePath $mysqldExe -ArgumentList "--skip-grant-tables", "--console", "--defaults-file=D:\mysql\my.ini" -PassThru -WindowStyle Normal

Write-Host "等待 MySQL 启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "步骤 3: 重置密码..." -ForegroundColor Yellow

# 执行 SQL 命令重置密码
$sqlCommand = "USE mysql; FLUSH PRIVILEGES; ALTER USER 'root'@'localhost' IDENTIFIED BY '$passwordPlain'; FLUSH PRIVILEGES;"
$env:MYSQL_PWD = ""
$result = & $mysqlExe -u root -e $sqlCommand 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "尝试使用 UPDATE 方式（适用于旧版本）..." -ForegroundColor Yellow
    # 注意：MySQL 8.0+ 不支持 PASSWORD() 函数，但可以尝试
    $sqlCommand = "USE mysql; FLUSH PRIVILEGES; UPDATE user SET authentication_string='' WHERE User='root' AND Host='localhost'; FLUSH PRIVILEGES; ALTER USER 'root'@'localhost' IDENTIFIED BY '$passwordPlain'; FLUSH PRIVILEGES;"
    $result = & $mysqlExe -u root -e $sqlCommand 2>&1
}

Write-Host ""
Write-Host "步骤 4: 关闭跳过权限表的 MySQL..." -ForegroundColor Yellow
Stop-Process -Id $mysqldProcess.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "步骤 5: 正常启动 MySQL 服务..." -ForegroundColor Yellow
Start-Service MySQL
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "步骤 6: 测试新密码..." -ForegroundColor Yellow

# 测试连接
$env:MYSQL_PWD = $passwordPlain
$testResult = & $mysqlExe -u root -e "SELECT 1;" 2>&1
$env:MYSQL_PWD = $null

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ 密码重置成功！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "请更新 backend/.env 文件中的以下配置:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "DB_PASSWORD=$passwordPlain" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "⚠️  密码可能未正确设置，请手动测试" -ForegroundColor Yellow
    Write-Host "运行: $mysqlExe -u root -p" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "完成！" -ForegroundColor Green

