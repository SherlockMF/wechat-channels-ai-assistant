@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo  视频号内容诊断助手 · 一键启动
echo ========================================
echo.
echo 请不要关闭本窗口。
echo.

set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\ffmpeg\bin;%LocalAppData%\Microsoft\WinGet\Links;%PATH%"

where node >nul 2>nul
set "_need=0"
if errorlevel 1 set "_need=1"
where ffmpeg >nul 2>nul
if errorlevel 1 set "_need=1"

if "%_need%"=="1" (
  echo 正在安装缺少的依赖（Node / FFmpeg）…
  echo 可能弹出权限窗口，请点「是」。
  echo.
  call "%~dp0安装依赖.bat"
  set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\ffmpeg\bin;%LocalAppData%\Microsoft\WinGet\Links;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 (
    echo 仍未找到 Node。请重新双击本文件，或先运行「安装依赖.bat」。
    pause
    exit /b 1
  )
)

if not exist "%~dp0.env" copy /Y "%~dp0.env.example" "%~dp0.env" >nul

if not exist "%~dp0node_modules\" (
  echo 正在安装项目依赖（首次较慢，需联网）…
  call npm ci
  if errorlevel 1 call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo 正在启动，浏览器稍后会打开 http://localhost:3000
echo.
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"
call npm run dev
echo.
echo 已结束。关闭本窗口即可。
pause
endlocal
