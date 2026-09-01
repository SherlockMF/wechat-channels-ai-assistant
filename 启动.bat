@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo  视频号内容诊断助手 - 启动（本机）
echo ========================================
echo.

set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\ffmpeg\bin;%LocalAppData%\Microsoft\WinGet\Links;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo [缺少 Node] 正在打开「安装依赖.bat」...
  call "%~dp0安装依赖.bat"
  set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\ffmpeg\bin;%LocalAppData%\Microsoft\WinGet\Links;!PATH!"
  where node >nul 2>nul
  if errorlevel 1 (
    echo 仍未检测到 Node，请安装成功后重新双击本脚本。
    pause
    exit /b 1
  )
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [缺少 FFmpeg] 建议先运行「安装依赖.bat」（审片/截帧需要）。
  echo 也可现在继续启动，稍后再装 FFmpeg。
  choice /C YN /M "是否现在安装依赖"
  if errorlevel 2 goto after_ffmpeg_check
  if errorlevel 1 call "%~dp0安装依赖.bat"
)

:after_ffmpeg_check
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\ffmpeg\bin;%LocalAppData%\Microsoft\WinGet\Links;%PATH%"

if not exist "%~dp0.env" (
  echo 正在创建 .env ...
  copy /Y "%~dp0.env.example" "%~dp0.env" >nul
)

if not exist "%~dp0node_modules\" (
  echo 首次运行：安装 npm 依赖（需联网，可能较久）...
  call npm ci
  if errorlevel 1 (
    echo npm ci 失败，尝试 npm install ...
    call npm install
  )
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo.
echo 正在检查 RSSHub（首次运行会自动安装 Docker Desktop）...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-rsshub-windows.ps1" -InstallIfMissing
set "_rsshub_result=!errorlevel!"
if "!_rsshub_result!"=="0" (
  set "HOTSPOT_RSSHUB_BASE_URL=http://127.0.0.1:1200"
) else (
  echo [提示] RSSHub 暂未就绪，工作台仍会启动，普通 RSS 源可继续使用。
  if "!_rsshub_result!"=="10" echo [提示] 请重启电脑后再次双击本文件。
)

set "_web_port="
for /f "delims=" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\find-running-workbench-windows.ps1"') do set "_web_port=%%P"
if defined _web_port (
  set "_web_url=http://localhost:!_web_port!"
  echo 工作台已在运行，正在打开 !_web_url!
  start "" "!_web_url!"
  exit /b 0
)
for /f "delims=" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\find-free-port-windows.ps1"') do set "_web_port=%%P"
if not defined _web_port (
  echo 未找到可用 Web 端口，请关闭其他开发服务后重试。
  pause
  exit /b 1
)
set "_web_url=http://localhost:!_web_port!"

echo 正在启动 Web（!_web_url!）...
echo 请保持本窗口不要关闭。
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\open-url-when-ready-windows.ps1" -Url "!_web_url!"
call npm run dev --workspace @video-diagnosis/web -- --port !_web_port!
echo.
echo 服务已结束。
pause
endlocal
