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
  set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\ffmpeg\bin;%LocalAppData%\Microsoft\WinGet\Links;%PATH%"
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

echo 正在启动 Web（http://localhost:3000 ）...
echo 请保持本窗口不要关闭。
echo.

start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"
call npm run dev
echo.
echo 服务已结束。
pause
endlocal
