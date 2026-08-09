@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo  启动（Docker 可选路径）
echo ========================================
echo.
echo 默认请用「启动.bat」本机模式。仅在已安装 Docker Desktop 时使用本脚本。
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Docker，请改用「启动.bat」或先安装 Docker Desktop。
  start "" "https://www.docker.com/products/docker-desktop/"
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo 尝试启动 Docker Desktop...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  )
  timeout /t 20 /nobreak >nul
)

docker compose up -d --build
if errorlevel 1 (
  echo 启动失败。
  pause
  exit /b 1
)
start "" "http://localhost:3000"
echo 已请求启动。可用「停止-Docker.bat」停止。
pause
