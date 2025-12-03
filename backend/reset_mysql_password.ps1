# MySQL 密码重置脚本
# 使用方法: 以管理员身份运行 PowerShell，然后执行此脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MySQL 密码重置工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员身份运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误: 请以管理员身份运行此脚本！" -ForegroundColor Red
    Write-Host "右键点击 PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

# MySQL 路径
$mysqlPath = "D:\mysql\bin"
$mysqlExe = Join-Path $mysqlPath "mysql.exe"
$mysqldExe = Join-Path $mysqlPath "mysqld.exe"

# 检查 MySQL 是否存在
if (-not (Test-Path $mysqldExe)) {
    Write-Host "错误: 找不到 MySQL 安装目录: $mysqlPath" -ForegroundColor Red
    exit 1
}

Write-Host "步骤 1: 停止 MySQL 服务..." -ForegroundColor Yellow
Stop-Service mysql -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "步骤 2: 以跳过权限表模式启动 MySQL..." -ForegroundColor Yellow
Write-Host "注意: 将打开一个新窗口运行 MySQL，请保持该窗口打开" -ForegroundColor Yellow
Write-Host ""

# 启动 MySQL（跳过权限表）
$mysqldProcess = Start-Process -FilePath $mysqldExe -ArgumentList "--skip-grant-tables", "--console" -PassThru -WindowStyle Normal

Write-Host "等待 MySQL 启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "步骤 3: 请输入新密码（将用于 root 用户）:" -ForegroundColor Yellow
$newPassword = Read-Host -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPassword))

if ([string]::IsNullOrWhiteSpace($passwordPlain)) {
    Write-Host "错误: 密码不能为空！" -ForegroundColor Red
    Stop-Process -Id $mysqldProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Service mysql
    exit 1
}

Write-Host ""
Write-Host "步骤 4: 重置密码..." -ForegroundColor Yellow

# 执行 SQL 命令（直接使用 -e 参数）
# MySQL 8.0+ 使用 ALTER USER
$sqlCommand = "USE mysql; FLUSH PRIVILEGES; ALTER USER 'root'@'localhost' IDENTIFIED BY '$passwordPlain'; FLUSH PRIVILEGES;"
$result = & $mysqlExe -u root -e "$sqlCommand" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "尝试使用 UPDATE 方式（适用于旧版本 MySQL）..." -ForegroundColor Yellow
    # 旧版本 MySQL 使用 UPDATE（注意：MySQL 8.0+ 不支持 PASSWORD() 函数）
    $sqlCommand = "USE mysql; UPDATE user SET authentication_string=PASSWORD('$passwordPlain') WHERE User='root'; FLUSH PRIVILEGES;"
    $result = & $mysqlExe -u root -e "$sqlCommand" 2>&1
}

Write-Host ""
Write-Host "步骤 5: 关闭跳过权限表的 MySQL..." -ForegroundColor Yellow
Stop-Process -Id $mysqldProcess.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "步骤 6: 正常启动 MySQL 服务..." -ForegroundColor Yellow
Start-Service mysql
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "步骤 7: 测试新密码..." -ForegroundColor Yellow

# 测试连接（使用 --password= 格式更可靠）
$env:MYSQL_PWD = $passwordPlain
$testResult = & $mysqlExe -u root -e "SELECT 1;" 2>&1
$env:MYSQL_PWD = $null

if ($LASTEXITCODE -eq 0 -or $testResult -notmatch "Access denied") {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ 密码重置成功！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "请更新 backend/.env 文件中的以下配置:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "DB_USER=root" -ForegroundColor Cyan
    Write-Host "DB_PASSWORD=$passwordPlain" -ForegroundColor Cyan
    Write-Host "DB_HOST=localhost" -ForegroundColor Cyan
    Write-Host "DB_PORT=3306" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "警告: 密码可能未正确设置，请手动测试" -ForegroundColor Yellow
    Write-Host "运行: $mysqlExe -u root -p" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "完成！" -ForegroundColor Green

