@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo  安装本机依赖（Node + FFmpeg）
echo ========================================
echo.
echo 将使用 Windows 包管理器 winget 安装（需联网、可能弹出 UAC）。
echo.

where winget >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 winget。
  echo 请先安装「应用安装程序」(App Installer)，或手动安装：
  echo   Node.js LTS  https://nodejs.org/
  echo   FFmpeg       https://www.gyan.dev/ffmpeg/builds/
  echo.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

call :ensure_node
if errorlevel 1 exit /b 1
call :ensure_ffmpeg
if errorlevel 1 exit /b 1

echo.
echo ========================================
echo  依赖已就绪
echo ========================================
call :print_versions
echo.
echo 下一步：双击「启动.bat」
echo.
pause
exit /b 0

:refresh_path
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\ffmpeg\bin;%LocalAppData%\Microsoft\WinGet\Links;%PATH%"
where node >nul 2>nul
where ffmpeg >nul 2>nul
exit /b 0

:ensure_node
call :refresh_path
where node >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%v in ('node -v 2^>nul') do echo [OK] 已检测到 Node %%v
  exit /b 0
)
echo [安装] Node.js LTS ...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
call :refresh_path
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] Node 安装后仍不可用。请关闭本窗口，重新打开「安装依赖.bat」，或手动安装后重试。
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v 2^>nul') do echo [OK] Node %%v
exit /b 0

:ensure_ffmpeg
call :refresh_path
where ffmpeg >nul 2>nul
if not errorlevel 1 (
  echo [OK] 已检测到 FFmpeg
  exit /b 0
)
echo [安装] FFmpeg ...
winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
call :refresh_path
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [错误] FFmpeg 安装后仍不可用。请关闭窗口重开脚本，或手动安装后把 ffmpeg\bin 加入 PATH。
  start "" "https://www.gyan.dev/ffmpeg/builds/"
  pause
  exit /b 1
)
echo [OK] FFmpeg 已可用
exit /b 0

:print_versions
call :refresh_path
where node >nul 2>nul && node -v
where npm >nul 2>nul && npm -v
where ffmpeg >nul 2>nul && ffmpeg -version 2>nul | findstr /i "ffmpeg version"
exit /b 0
