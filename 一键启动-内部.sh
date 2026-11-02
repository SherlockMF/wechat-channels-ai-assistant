#!/bin/bash
# 由「一键启动.app」调用，用户无需自己操作终端
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# 去掉隔离，避免后续脚本再被拦截
xattr -cr "$ROOT" 2>/dev/null || true
chmod +x "$ROOT"/*.command "$ROOT"/*.sh 2>/dev/null || true

echo "========================================"
echo " 微信视频号 AI 创作助手 · 一键启动"
echo "========================================"
echo
echo "请不要关闭本窗口。"
echo

# Homebrew PATH（Apple Silicon / Intel）
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

need_install=0
command -v node >/dev/null 2>&1 || need_install=1
command -v ffmpeg >/dev/null 2>&1 || need_install=1

if [ "$need_install" -eq 1 ]; then
  echo "正在检查/安装 Node 与 FFmpeg（首次较慢，需联网）…"
  if ! command -v brew >/dev/null 2>&1; then
    echo "正在安装 Homebrew…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
  if ! command -v brew >/dev/null 2>&1; then
    osascript -e 'display dialog "自动安装失败。请打开 https://nodejs.org 安装 Node，装好后重新双击「一键启动」。" buttons {"好"} default button 1 with icon caution'
    exit 1
  fi
  command -v node >/dev/null 2>&1 || brew install node
  command -v ffmpeg >/dev/null 2>&1 || brew install ffmpeg
fi

if [ ! -f .env ]; then
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "正在安装项目依赖（首次较慢）…"
  npm ci || npm install
fi

echo "正在打开浏览器并启动服务…"
(sleep 6; open "http://localhost:3000") &
npm run dev
