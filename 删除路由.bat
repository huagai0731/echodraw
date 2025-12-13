@echo off
chcp 65001 >nul
echo ========================================
echo 删除到 115.190.238.247 的路由规则
echo ========================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误: 需要管理员权限！
    echo 请右键点击此文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo [1/3] 显示当前路由...
route print | findstr "115.190.238.247"

echo.
echo [2/3] 删除路由...
route delete 115.190.238.247 >nul 2>&1
if %errorLevel% equ 0 (
    echo ✓ 路由已删除
) else (
    echo ✗ 删除失败或路由不存在
)

echo.
echo [3/3] 验证删除结果...
route print | findstr "115.190.238.247"
if %errorLevel% equ 0 (
    echo 警告: 仍然存在路由，可能需要多次删除
) else (
    echo ✓ 确认路由已清除
)

echo.
echo 刷新DNS缓存...
ipconfig /flushdns >nul
echo ✓ DNS缓存已刷新

echo.
echo ========================================
echo 完成！现在尝试ping服务器测试连通性
echo ========================================
ping -n 2 115.190.238.247

echo.
pause

