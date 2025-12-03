@echo off
REM 从本地 MySQL 导出数据库的 Windows 批处理脚本

echo ========================================
echo 导出本地数据库
echo ========================================
echo.

REM 设置变量（根据你的实际情况修改）
set DB_NAME=echo
set DB_USER=root
set DB_HOST=localhost
set OUTPUT_FILE=echo_backup.sql

echo 数据库名: %DB_NAME%
echo 用户名: %DB_USER%
echo 输出文件: %OUTPUT_FILE%
echo.

REM 检查 mysqldump 是否存在
where mysqldump >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 错误: 找不到 mysqldump 命令
    echo.
    echo 请确保 MySQL 已安装，并且 MySQL bin 目录在 PATH 中
    echo 或者使用完整路径，例如:
    echo "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
    echo.
    pause
    exit /b 1
)

echo 正在导出数据库...
echo 提示: 请输入数据库密码
echo.

REM 导出数据库
mysqldump -h %DB_HOST% -u %DB_USER% -p --default-character-set=utf8mb4 --single-transaction --routines --triggers %DB_NAME% > %OUTPUT_FILE%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo 导出成功！
    echo ========================================
    echo 文件位置: %CD%\%OUTPUT_FILE%
    echo.
    echo 下一步:
    echo 1. 将 %OUTPUT_FILE% 上传到云服务器
    echo 2. 在宝塔面板中导入数据库
    echo.
) else (
    echo.
    echo ========================================
    echo 导出失败！
    echo ========================================
    echo 请检查:
    echo - 数据库名是否正确
    echo - 用户名和密码是否正确
    echo - MySQL 服务是否运行
    echo.
)

pause








