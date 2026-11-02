#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo " 微信视频号 AI 创作助手 - 启动（本机）"
echo "========================================"
echo

if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[缺少 Node] 正在运行「安装依赖.command」..."
  bash "./安装依赖.command"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "仍未检测到 Node，请安装成功后重新双击本脚本。"
    read -r -p "按回车键退出..."
    exit 1
  fi
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[缺少 FFmpeg] 审片/截帧需要 FFmpeg。"
  read -r -p "是否现在安装依赖？[Y/n] " ans
  ans=${ans:-Y}
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    bash "./安装依赖.command"
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
fi

if [ ! -f .env ]; then
  echo "正在创建 .env ..."
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "首次运行：安装 npm 依赖（需联网，可能较久）..."
  if ! npm ci; then
    npm install
  fi
fi

echo "正在启动 Web（http://localhost:3000 ）..."
echo "请保持本窗口不要关闭。"
echo

(sleep 8; open "http://localhost:3000") &
npm run dev
echo
echo "服务已结束。"
read -r -p "按回车键退出..."
