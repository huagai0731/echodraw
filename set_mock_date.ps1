# 设置模拟日期的 PowerShell 脚本
# 允许用户输入日期，自动修改前端和后端的配置

# 设置控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Validate-Date {
    param([string]$DateStr)
    
    try {
        [DateTime]::ParseExact($DateStr, "yyyy-MM-dd", $null)
        return $true
    }
    catch {
        return $false
    }
}

function Update-FrontendDate {
    param([string]$DateStr)
    
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $frontendFile = Join-Path $projectRoot "frontend\src\utils\dateUtils.ts"
    
    if (-not (Test-Path $frontendFile)) {
        Write-Host "❌ 错误: 找不到前端文件 $frontendFile" -ForegroundColor Red
        return $false
    }
    
    try {
        $content = Get-Content $frontendFile -Raw -Encoding UTF8
        
        # 替换日期
        $pattern = 'return\s+"(\d{4}-\d{2}-\d{2})";\s*//\s*测试用'
        if ($content -match $pattern) {
            $content = $content -replace $pattern, "return `"$DateStr`"; // 测试用，模拟日期"
        }
        else {
            # 如果没有注释，尝试直接匹配日期字符串
            $pattern2 = 'return\s+"(\d{4}-\d{2}-\d{2})";'
            if ($content -match $pattern2) {
                $content = $content -replace $pattern2, "return `"$DateStr`";"
            }
            else {
                Write-Host "⚠️  警告: 无法在前端文件中找到日期模式" -ForegroundColor Yellow
                return $false
            }
        }
        
        Set-Content -Path $frontendFile -Value $content -Encoding UTF8 -NoNewline
        Write-Host "✅ 前端日期已更新为: $DateStr" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ 更新前端文件时出错: $_" -ForegroundColor Red
        return $false
    }
}

function Update-BackendDefaultDate {
    param([string]$DateStr)
    
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $backendFile = Join-Path $projectRoot "backend\core\views.py"
    
    if (-not (Test-Path $backendFile)) {
        Write-Host "❌ 错误: 找不到后端文件 $backendFile" -ForegroundColor Red
        return $false
    }
    
    try {
        $content = Get-Content $backendFile -Raw -Encoding UTF8
        
        # 替换两个函数中的默认日期
        # 匹配模式: os.getenv("MOCK_DATE", "2026-03-01")
        $pattern = 'os\.getenv\("MOCK_DATE",\s*"(\d{4}-\d{2}-\d{2})"'
        $replacement = "os.getenv(`"MOCK_DATE`", `"$DateStr`""
        
        if ($content -match $pattern) {
            $content = $content -replace $pattern, $replacement
            Set-Content -Path $backendFile -Value $content -Encoding UTF8 -NoNewline
            Write-Host "✅ 后端默认日期已更新为: $DateStr" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "⚠️  警告: 无法在后端文件中找到日期模式" -ForegroundColor Yellow
            return $false
        }
    }
    catch {
        Write-Host "❌ 更新后端文件时出错: $_" -ForegroundColor Red
        return $false
    }
}

function Update-BackendEnvFile {
    param([string]$DateStr)
    
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $envFile = Join-Path $projectRoot "backend\.env.local"
    
    try {
        $lines = @()
        $found = $false
        
        if (Test-Path $envFile) {
            $lines = Get-Content $envFile
            
            # 查找并更新 MOCK_DATE
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i] -match '^MOCK_DATE=') {
                    $lines[$i] = "MOCK_DATE=$DateStr"
                    $found = $true
                    break
                }
            }
        }
        
        # 如果没有找到，添加新行
        if (-not $found) {
            if ($lines.Count -eq 0) {
                $lines += "# 模拟日期配置"
            }
            $lines += "MOCK_DATE=$DateStr"
        }
        
        Set-Content -Path $envFile -Value $lines -Encoding UTF8
        Write-Host "✅ 后端环境变量文件已更新: $envFile" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ 更新环境变量文件时出错: $_" -ForegroundColor Red
        return $false
    }
}

# 主函数
Write-Host ("=" * 50)
Write-Host "设置模拟日期工具"
Write-Host ("=" * 50)
Write-Host ""

# 显示当前日期
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendFile = Join-Path $projectRoot "frontend\src\utils\dateUtils.ts"
if (Test-Path $frontendFile) {
    $content = Get-Content $frontendFile -Raw -Encoding UTF8
    if ($content -match 'return\s+"(\d{4}-\d{2}-\d{2})"') {
        $currentDate = $matches[1]
        Write-Host "📅 当前设置的模拟日期: $currentDate" -ForegroundColor Cyan
        Write-Host ""
    }
}

# 获取用户输入
$dateInput = ""
while ($true) {
    $dateInput = Read-Host "请输入新的模拟日期 (格式: YYYY-MM-DD，例如 2026-03-01，直接回车使用当前真实日期)"
    
    if ([string]::IsNullOrWhiteSpace($dateInput)) {
        # 使用当前日期
        $today = Get-Date -Format "yyyy-MM-dd"
        $dateStr = $today
        Write-Host "📅 将使用当前真实日期: $dateStr" -ForegroundColor Cyan
        break
    }
    
    if (Validate-Date -DateStr $dateInput) {
        $dateStr = $dateInput
        break
    }
    else {
        Write-Host "❌ 日期格式不正确，请输入 YYYY-MM-DD 格式的日期（例如: 2026-03-01）" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "正在更新配置..."
Write-Host ("-" * 50)

# 更新前端
$frontendSuccess = Update-FrontendDate -DateStr $dateStr

# 更新后端默认值
$backendSuccess = Update-BackendDefaultDate -DateStr $dateStr

# 更新环境变量文件
$envSuccess = Update-BackendEnvFile -DateStr $dateStr

Write-Host ("-" * 50)
Write-Host ""

if ($frontendSuccess -and $backendSuccess) {
    Write-Host ("=" * 50)
    Write-Host "✅ 配置更新完成！" -ForegroundColor Green
    Write-Host ("=" * 50)
    Write-Host ""
    Write-Host "📅 模拟日期已设置为: $dateStr" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "下一步操作:"
    Write-Host "1. 重启前端服务（如果正在运行）"
    Write-Host "2. 重启后端服务（如果正在运行）"
    Write-Host "3. 重新加载页面查看效果"
    Write-Host ""
}
else {
    Write-Host ("=" * 50)
    Write-Host "⚠️  配置更新部分失败，请检查上面的错误信息" -ForegroundColor Yellow
    Write-Host ("=" * 50)
}

