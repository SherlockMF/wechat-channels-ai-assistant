@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在停止本机 Web 服务（占用 3000 端口的进程）...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
  echo 结束 PID %%p
  taskkill /PID %%p /F >nul 2>nul
)
echo 完成。
pause
