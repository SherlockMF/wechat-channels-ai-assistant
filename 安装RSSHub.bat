@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo  RSSHub 安装 / 修复
echo ========================================
echo 首次安装可能弹出权限窗口，请点「是」。
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-rsshub-windows.ps1" -InstallIfMissing
set "_result=%errorlevel%"
echo.
if "%_result%"=="0" (
  echo RSSHub 已就绪：http://127.0.0.1:1200
) else if "%_result%"=="10" (
  echo 安装已完成，但需要重启电脑；重启后运行「一键启动.bat」。
) else (
  echo RSSHub 暂未就绪。请根据上方提示处理后重试。
)
pause
exit /b %_result%
