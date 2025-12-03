# 启动 / 重启 Echo 项目前后端开发服务的脚本
param(
    [switch]$SkipKill,
    [switch]$SkipInstall
)

$scriptPath = $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Path $scriptPath -Parent
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"

function Write-Section {
    param(
        [string]$Message
    )

    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Stop-PortListener {
    param(
        [int]$Port
    )

    if ($SkipKill.IsPresent) {
        return
    }

    $netCmd = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if (-not $netCmd) {
        Write-Host "跳过端口 $Port 的自动关闭（当前 PowerShell 不支持 Get-NetTCPConnection）" -ForegroundColor Yellow
        return
    }

    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    } catch {
        return
    }

    if (-not $connections) {
        return
    }

    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $pids) {
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            Write-Host ("终止使用端口 {0} 的进程: {1} ({2})" -f $Port, $process.ProcessName, $processId)
            Stop-Process -Id $processId -Force -ErrorAction Stop
        } catch {
            Write-Host ("无法终止端口 {0} 上的进程 {1}: {2}" -f $Port, $processId, $_.Exception.Message) -ForegroundColor Yellow
        }
    }
}

function Ensure-ToolExists {
    param(
        [string]$Tool,
        [string]$InstallHint
    )

    if (Get-Command $Tool -ErrorAction SilentlyContinue) {
        return
    }

    throw ("未找到命令 {0}，请先安装或配置环境变量。提示: {1}" -f $Tool, $InstallHint)
}

function Ensure-FrontendDependencies {
    if ($SkipInstall.IsPresent) {
        return
    }

    $nodeModules = Join-Path $frontendDir "node_modules"
    if (Test-Path $nodeModules) {
        return
    }

    Write-Section "安装 / 更新前端依赖 (npm install)"
    Push-Location $frontendDir
    try {
        npm install
    } catch {
        throw "npm install 失败: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

function Get-LocalIPv4 {
    $interfaces = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object {
            $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
            $_.NetworkInterfaceType -notin @(
                [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback,
                [System.Net.NetworkInformation.NetworkInterfaceType]::Tunnel,
                [System.Net.NetworkInformation.NetworkInterfaceType]::Unknown
            )
        }

    foreach ($interface in $interfaces) {
        $properties = $interface.GetIPProperties()
        foreach ($address in $properties.UnicastAddresses) {
            if ($address.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                -not $address.Address.IsIPv6LinkLocal -and
                $address.Address.ToString() -ne "127.0.0.1") {
                return $address.Address.ToString()
            }
        }
    }

    return $null
}

function Wait-ForPort {
    param(
        [int]$Port,
        [string]$TargetHost = "127.0.0.1",
        [int]$TimeoutSeconds = 30
    )

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        try {
            $tcpClient.Connect($TargetHost, $Port)
            $tcpClient.Dispose()
            return $true
        } catch {
            $tcpClient.Dispose()
            Start-Sleep -Milliseconds 500
        }
    }

    return $false
}

function Test-RedisConnection {
    try {
        $result = python -c "import redis; r = redis.Redis(host='localhost', port=6379, db=0); r.ping(); print('OK')" 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -match "OK") {
            return $true
        }
        return $false
    } catch {
        return $false
    }
}

Write-Section "准备启动 Echo 开发环境"
Write-Host ("项目根目录: {0}" -f $projectRoot)

if (-not (Test-Path $backendDir)) {
    throw "未找到 backend 目录，当前脚本应放在仓库根目录运行。"
}

if (-not (Test-Path $frontendDir)) {
    throw "未找到 frontend 目录，当前脚本应放在仓库根目录运行。"
}

Ensure-ToolExists -Tool "python" -InstallHint "请确认已安装 Python 并勾选添加到 PATH。"
Ensure-ToolExists -Tool "npm" -InstallHint "请安装 Node.js 18+ 并勾选将 npm 添加到 PATH。"

Ensure-FrontendDependencies

if (-not $SkipKill.IsPresent) {
    Write-Section "检查并释放占用的端口"
    Stop-PortListener -Port 8000
    Stop-PortListener -Port 5173
}

$powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

Write-Section "启动 Django 后端 (http://127.0.0.1:8000)"
$backendCommand = @"
Set-Location `"$backendDir`"
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
"@
$backendProcess = Start-Process -FilePath $powershellExe -ArgumentList "-NoExit", "-Command", $backendCommand -PassThru
Write-Host ("后端进程 PID: {0}" -f $backendProcess.Id)

Write-Section "等待后端端口 8000 可用"
$backendReady = $false
while (-not $backendReady) {
    $backendReady = Wait-ForPort -Port 8000 -TimeoutSeconds 30
    if ($backendReady) {
        break
    }

    $backendAlive = $true
    try {
        $null = Get-Process -Id $backendProcess.Id -ErrorAction Stop
    } catch {
        $backendAlive = $false
    }

    if (-not $backendAlive) {
        throw "后端进程 (PID $($backendProcess.Id)) 已退出，请查看后端窗口以获取错误详情。"
    }

    Write-Host "仍未检测到端口 8000，10 秒后重试..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}
Write-Host "后端已就绪，继续启动前端。" -ForegroundColor Green

Write-Section "启动 Vite 前端 (http://localhost:5173)"
$localIp = Get-LocalIPv4
$assetHost = if ($localIp) { $localIp } else { "127.0.0.1" }
$assetBaseUrl = "http://$assetHost`:8000"
Write-Host ("已设置 VITE_ASSET_BASE_URL={0}" -f $assetBaseUrl)
$frontendCommand = @"
Set-Item Env:VITE_ASSET_BASE_URL `"$assetBaseUrl`"
Set-Location `"$frontendDir`"
npm run dev
"@
$frontendProcess = Start-Process -FilePath $powershellExe -ArgumentList "-NoExit", "-Command", $frontendCommand -PassThru
Write-Host ("前端进程 PID: {0}" -f $frontendProcess.Id)

Write-Section "启动 Celery Worker"
Write-Host "检查 Redis 连接..."
if (-not (Test-RedisConnection)) {
    Write-Host "警告: Redis 连接失败，Celery Worker 可能无法正常工作。" -ForegroundColor Yellow
    Write-Host "请确保 Redis 已启动（默认端口 6379）。" -ForegroundColor Yellow
    $startCelery = Read-Host "是否仍要继续启动 Celery Worker? (y/N)"
    if ($startCelery -ne "y" -and $startCelery -ne "Y") {
        Write-Host "跳过启动 Celery Worker。" -ForegroundColor Yellow
    } else {
        $celeryCommand = @"
Set-Location `"$backendDir`"
python -m celery -A config worker --loglevel=info --pool=solo
"@
        $celeryProcess = Start-Process -FilePath $powershellExe -ArgumentList "-NoExit", "-Command", $celeryCommand -PassThru
        Write-Host ("Celery Worker 进程 PID: {0}" -f $celeryProcess.Id)
        Write-Host "已在新的 PowerShell 窗口中启动 Celery Worker。" -ForegroundColor Green
    }
} else {
    Write-Host "✓ Redis 连接成功" -ForegroundColor Green
    $celeryCommand = @"
Set-Location `"$backendDir`"
python -m celery -A config worker --loglevel=info --pool=solo
"@
    $celeryProcess = Start-Process -FilePath $powershellExe -ArgumentList "-NoExit", "-Command", $celeryCommand -PassThru
    Write-Host ("Celery Worker 进程 PID: {0}" -f $celeryProcess.Id)
    Write-Host "已在新的 PowerShell 窗口中启动 Celery Worker。" -ForegroundColor Green
}

Write-Section "完成"
Write-Host "已在新的 PowerShell 窗口中启动前后端服务和 Celery Worker。"
Write-Host "如需跳过自动终止端口进程，可运行: powershell -ExecutionPolicy Bypass -File `"$($scriptPath)`" -SkipKill"
Write-Host "如需跳过 npm install，可增加 -SkipInstall 参数（确保手动安装过依赖）。"




