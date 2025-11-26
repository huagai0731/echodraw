# 使用 Docker 启动 Redis (PowerShell)
# 使用方法: .\start_redis_docker.ps1

Write-Host "正在使用 Docker 启动 Redis..." -ForegroundColor Green

# 检查 Docker 是否安装
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "✗ Docker 未安装" -ForegroundColor Red
    Write-Host "请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# 检查 Redis 容器是否已运行
$redisRunning = docker ps --filter "name=redis" --format "{{.Names}}" | Select-String "redis"
if ($redisRunning) {
    Write-Host "✓ Redis 容器已在运行: $redisRunning" -ForegroundColor Green
    exit 0
}

# 启动 Redis 容器
Write-Host "启动 Redis 容器..." -ForegroundColor Yellow
docker run -d --name redis -p 6379:6379 redis:latest

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Redis 容器启动成功" -ForegroundColor Green
    Write-Host "Redis 运行在: localhost:6379" -ForegroundColor Cyan
} else {
    Write-Host "✗ Redis 容器启动失败" -ForegroundColor Red
    exit 1
}

