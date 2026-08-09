#!/bin/bash
cd "$(dirname "$0")"
echo "正在停止本机 Web 服务（占用 3000 端口的进程）..."
if command -v lsof >/dev/null 2>&1; then
  pids=$(lsof -ti tcp:3000 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    echo "已结束: $pids"
  else
    echo "未发现占用 3000 的进程。"
  fi
else
  echo "未找到 lsof，请手动关闭运行「启动.command」的终端窗口。"
fi
read -r -p "按回车键退出..."
