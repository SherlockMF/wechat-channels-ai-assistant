#!/bin/bash
# 苹果电脑启动脚本
# 用法：终端输入 bash +空格，拖入本文件，回车
set +e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../package.json" ]; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  ROOT="$SCRIPT_DIR"
fi
cd "$ROOT" || {
  osascript -e 'display dialog "找不到软件目录，请把整个文件夹复制到桌面后再试。" buttons {"好"} default button 1 with icon stop'
  exit 1
}

# 手动安装的 Node / Homebrew 常见路径
export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/opt/node/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"

xattr -cr "$ROOT" 2>/dev/null || true
chmod +x "$SCRIPT_DIR"/*.command "$ROOT"/*.command "$ROOT"/*.sh 2>/dev/null || true

DESKTOP_LAUNCHER="$HOME/Desktop/视频号助手.command"
cat > "$DESKTOP_LAUNCHER" <<EOF
#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:\$PATH"
cd $(printf '%q' "$ROOT") || exit 1
echo "正在启动微信视频号 AI 创作助手…"
echo "请不要关闭本窗口。"
(sleep 5; open "http://localhost:3000") &
npm run dev
EOF
chmod +x "$DESKTOP_LAUNCHER" 2>/dev/null || true
xattr -cr "$DESKTOP_LAUNCHER" 2>/dev/null || true

echo "========================================"
echo " 微信视频号 AI 创作助手"
echo "========================================"
echo "目录: $ROOT"
echo "已在桌面创建「视频号助手.command」"
echo

if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true
fi

has_node=0
has_npm=0
has_ffmpeg=0
command -v node >/dev/null 2>&1 && has_node=1
command -v npm >/dev/null 2>&1 && has_npm=1
command -v ffmpeg >/dev/null 2>&1 && has_ffmpeg=1

echo "检测结果："
if [ "$has_node" -eq 1 ]; then
  echo "  Node  : $(node -v)  ← 已就绪"
else
  echo "  Node  : 未找到"
fi
if [ "$has_npm" -eq 1 ]; then
  echo "  npm   : $(npm -v)  ← 已就绪"
else
  echo "  npm   : 未找到"
fi
if [ "$has_ffmpeg" -eq 1 ]; then
  echo "  FFmpeg: 已就绪"
else
  echo "  FFmpeg: 未找到（可稍后再装，不影响先开网页/生成脚本）"
fi
echo

if [ "$has_node" -eq 0 ] || [ "$has_npm" -eq 0 ]; then
  osascript -e 'display dialog "还没检测到 Node/npm。\n\n请确认：\n1. 已用 Safari 打开 nodejs.org，点绿色「macOS 安装程序」装完\n2. 安装后【关掉旧终端】，重新开一个新终端再启动\n\n本脚本不再自动安装 Homebrew（网络常失败）。" buttons {"好"} default button 1 with icon caution'
  echo
  echo "请新开终端后再试。可先手动检查："
  echo "  node -v"
  echo "  npm -v"
  read -r -p "按回车键退出..."
  exit 1
fi

# 不再自动安装 Homebrew（国内网络经常 git fetch 失败）
# FFmpeg 缺失时仅提示，不阻断启动
if [ "$has_ffmpeg" -eq 0 ]; then
  echo "提示：暂无 FFmpeg，发布前审片可能不可用；脚本工作台仍可使用。"
  echo "以后若要装 FFmpeg，可在网络较好时自行执行：brew install ffmpeg"
  echo
fi

if [ ! -f .env ]; then
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "正在安装项目依赖（首次较慢，需联网）…"
  npm ci || npm install
  if [ $? -ne 0 ]; then
    echo "npm 安装失败，请检查网络后重试。"
    read -r -p "按回车键退出..."
    exit 1
  fi
fi

echo "即将打开网页 http://localhost:3000 …"
echo "请不要关闭本窗口。"
(sleep 6; open "http://localhost:3000") &
npm run dev
echo
echo "已结束。"
read -r -p "按回车键退出..."
