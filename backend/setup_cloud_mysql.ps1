# 交互式配置云端 MySQL 连接
# 这个脚本会帮助你设置 .env 文件中的云端 MySQL 配置

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "配置云端 MySQL 连接" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "请提供以下信息：" -ForegroundColor Yellow
Write-Host ""

# 获取配置信息
$dbHost = Read-Host "1. 数据库主机地址（IP 或域名）"
$dbPort = Read-Host "2. 数据库端口（默认 3306，直接回车使用默认值）"
if ([string]::IsNullOrWhiteSpace($dbPort)) {
    $dbPort = "3306"
}

$dbName = Read-Host "3. 数据库名称"
$dbUser = Read-Host "4. 数据库用户名"
$dbPassword = Read-Host "5. 数据库密码（输入时不会显示）" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword))

Write-Host ""
Write-Host "配置信息：" -ForegroundColor Cyan
Write-Host "  主机: $dbHost" -ForegroundColor Gray
Write-Host "  端口: $dbPort" -ForegroundColor Gray
Write-Host "  数据库: $dbName" -ForegroundColor Gray
Write-Host "  用户: $dbUser" -ForegroundColor Gray
Write-Host ""

$confirm = Read-Host "确认使用以上配置？(Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "已取消" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "正在更新 .env 文件..." -ForegroundColor Yellow

# 读取现有 .env 文件
$envFile = ".env"
$envContent = @()

if (Test-Path $envFile) {
    $envContent = Get-Content $envFile
} else {
    Write-Host "⚠️  .env 文件不存在，将创建新文件" -ForegroundColor Yellow
}

# 更新或添加配置
$updated = $false
$newContent = @()

foreach ($line in $envContent) {
    if ($line -match "^DJANGO_DB_ENGINE=") {
        $newContent += "DJANGO_DB_ENGINE=mysql"
        $updated = $true
    } elseif ($line -match "^DB_NAME=") {
        $newContent += "DB_NAME=$dbName"
        $updated = $true
    } elseif ($line -match "^DB_USER=") {
        $newContent += "DB_USER=$dbUser"
        $updated = $true
    } elseif ($line -match "^DB_PASSWORD=") {
        $newContent += "DB_PASSWORD=$dbPasswordPlain"
        $updated = $true
    } elseif ($line -match "^DB_HOST=") {
        $newContent += "DB_HOST=$dbHost"
        $updated = $true
    } elseif ($line -match "^DB_PORT=") {
        $newContent += "DB_PORT=$dbPort"
        $updated = $true
    } else {
        $newContent += $line
    }
}

# 如果没有找到现有配置，添加新配置
if (-not $updated) {
    $newContent += ""
    $newContent += "# MySQL 数据库配置（云端）"
    $newContent += "DJANGO_DB_ENGINE=mysql"
    $newContent += "DB_NAME=$dbName"
    $newContent += "DB_USER=$dbUser"
    $newContent += "DB_PASSWORD=$dbPasswordPlain"
    $newContent += "DB_HOST=$dbHost"
    $newContent += "DB_PORT=$dbPort"
}

# 写入文件
$newContent | Set-Content $envFile -Encoding UTF8

Write-Host "✅ .env 文件已更新" -ForegroundColor Green
Write-Host ""
Write-Host "现在测试连接..." -ForegroundColor Cyan
Write-Host ""

# 测试连接
python check_current_database.py

Write-Host ""
Write-Host "如果连接成功，运行以下命令创建表结构：" -ForegroundColor Yellow
Write-Host "  python manage.py migrate" -ForegroundColor Cyan

