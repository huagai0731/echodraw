@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
if not exist "%SCRIPT_DIR%start_echo_dev.ps1" (
    echo Could not find start_echo_dev.ps1. Make sure the .bat and .ps1 files are in the same folder.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_echo_dev.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo start_echo_dev.ps1 failed with exit code %EXIT_CODE%.
    echo Please review the PowerShell window for errors, fix them, and run this script again.
    pause
)

endlocal & exit /b %EXIT_CODE%






