#!/bin/bash
# Mac「一键启动.app」入口：自动打开终端跑内部脚本，用户不用自己找终端
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$ROOT/一键启动-内部.sh"

# 先尝试清隔离（本 app 已被用户允许打开后才执行到这里）
xattr -cr "$ROOT" 2>/dev/null || true
chmod +x "$SCRIPT" "$ROOT"/*.command 2>/dev/null || true

# 用 Terminal 跑，方便看到进度；路径做安全转义
ROOT_Q=$(printf '%q' "$ROOT")
SCRIPT_Q=$(printf '%q' "$SCRIPT")

osascript <<EOF
tell application "Terminal"
  activate
  do script "cd ${ROOT_Q} && bash ${SCRIPT_Q}"
end tell
EOF
