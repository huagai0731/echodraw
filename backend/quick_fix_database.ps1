# 一键修复数据库脚本 (PowerShell版本)
# 自动运行所有必要的迁移和修复步骤

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "数据库一键修复脚本" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 进入backend目录
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "步骤1: 检查迁移状态..." -ForegroundColor Yellow
python manage.py showmigrations

if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: 检查迁移状态失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤2: 应用所有迁移..." -ForegroundColor Yellow
python manage.py migrate --noinput

if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: 应用迁移失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤3: 运行迁移确保脚本..." -ForegroundColor Yellow
python ensure_migrations.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "警告: 迁移确保脚本发现问题" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "步骤4: 运行数据库结构修复脚本..." -ForegroundColor Yellow
python fix_database_structure.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "警告: 数据库结构修复脚本发现问题" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "修复完成！" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

