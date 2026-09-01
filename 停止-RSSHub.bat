@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%PATH%"
where docker >nul 2>nul
if errorlevel 1 (
  echo 未找到 Docker，RSSHub 无法通过此脚本停止。
  pause
  exit /b 1
)

docker compose --project-name shipinhao-rsshub --project-directory "%~dp0" -f "%~dp0docker-compose.rsshub.yml" down
if errorlevel 1 (
  echo 停止 RSSHub 失败。
  pause
  exit /b 1
)
echo RSSHub 已停止，缓存数据仍保留。
pause
endlocal
