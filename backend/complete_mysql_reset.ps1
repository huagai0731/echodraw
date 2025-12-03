# 完全重置 MySQL 配置
# 必须以管理员身份运行！

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 需要管理员权限！" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Red
Write-Host "完全重置 MySQL 配置" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "⚠️  警告：这将删除 MySQL 服务并清理配置" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "确认继续？(输入 YES 继续)"

if ($confirm -ne "YES") {
    Write-Host "已取消" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "步骤 1: 停止并删除 MySQL 服务..." -ForegroundColor Yellow
Stop-Service MySQL -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
sc.exe delete MySQL 2>&1 | Out-Null
Start-Sleep -Seconds 2
Write-Host "✅ 服务已删除" -ForegroundColor Green

Write-Host ""
Write-Host "步骤 2: 备份并清理配置文件..." -ForegroundColor Yellow
$configFiles = @(
    "C:\mysql-8.0.15-winx64\my.ini",
    "D:\mysql\my.ini"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        $backup = $file + ".backup." + (Get-Date -Format "yyyyMMddHHmmss")
        Copy-Item $file $backup -ErrorAction SilentlyContinue
        Write-Host "  已备份: $file -> $backup" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "步骤 3: 创建新的干净配置文件..." -ForegroundColor Yellow
$newConfig = @"
[mysqld]
# 基本配置
port=3306
basedir=C:\mysql-8.0.15-winx64
datadir=C:\mysql-8.0.15-winx64\data

# 网络配置 - 必须设置为 OFF
skip-networking=OFF

# 字符集
character-set-server=utf8mb4
default-character-set=utf8mb4

# 存储引擎
default-storage-engine=INNODB

# 认证
default_authentication_plugin=mysql_native_password

# 连接
max_connections=200
max_connect_errors=10

[mysql]
default-character-set=utf8mb4

[client]
port=3306
default-character-set=utf8mb4
"@

Set-Content -Path "C:\mysql-8.0.15-winx64\my.ini" -Value $newConfig -Encoding UTF8
Write-Host "✅ 已创建新配置文件" -ForegroundColor Green

Write-Host ""
Write-Host "步骤 4: 重新安装 MySQL 服务..." -ForegroundColor Yellow
Push-Location "D:\mysql\bin"
$result = & .\mysqld.exe --install MySQL --defaults-file="C:\mysql-8.0.15-winx64\my.ini" 2>&1
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
    Write-Host "❌ MySQL 服务启动失败" -ForegroundColor Red
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
    Write-Host "❌ skip_networking 仍然是 ON" -ForegroundColor Red
    Write-Host "输出: $result" -ForegroundColor Gray
    Write-Host ""
    Write-Host "可能需要检查 MySQL 数据目录中的配置" -ForegroundColor Yellow
}

