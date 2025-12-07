@echo off
chcp 65001 >nul
echo 正在运行设置模拟日期脚本...
echo.

REM 检查 Python 是否可用
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo 使用 Python 脚本...
    python set_mock_date.py
) else (
    echo 使用 PowerShell 脚本...
    powershell -ExecutionPolicy Bypass -File set_mock_date.ps1
)

pause

