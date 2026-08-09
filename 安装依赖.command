#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo " 安装本机依赖（Node + FFmpeg）"
echo "========================================"
echo
echo "将使用 Homebrew 安装（需联网）。"
echo

if ! command -v brew >/dev/null 2>&1; then
  echo "[安装] 未检测到 Homebrew，正在安装..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "[错误] Homebrew 不可用。请手动安装 Node 与 FFmpeg 后重试。"
  echo "  Node:   https://nodejs.org/"
  echo "  FFmpeg: brew install ffmpeg"
  open "https://nodejs.org/" 2>/dev/null || true
  read -r -p "按回车键退出..."
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  echo "[OK] 已检测到 Node $(node -v)"
else
  echo "[安装] Node..."
  brew install node
fi

if command -v ffmpeg >/dev/null 2>&1; then
  echo "[OK] 已检测到 FFmpeg"
else
  echo "[安装] FFmpeg..."
  brew install ffmpeg
fi

echo
echo "========================================"
echo " 依赖已就绪"
echo "========================================"
node -v
npm -v
ffmpeg -version | head -n 1
echo
echo "下一步：双击「启动.command」"
read -r -p "按回车键退出..."
