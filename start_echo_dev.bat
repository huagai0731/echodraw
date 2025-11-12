@echo off
setlocal

set SCRIPT_DIR=%~dp0
set POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe

if not exist "%SCRIPT_DIR%start_echo_dev.ps1" (
    echo 未找到 start_echo_dev.ps1，請確認 bat 與 ps1 文件位於同一目錄。
    exit /b 1
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_echo_dev.ps1" %*

endlocal






