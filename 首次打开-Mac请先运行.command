#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo " 解除 macOS 隔离限制（首次必做）"
echo "========================================"
echo
echo "将对本文件夹移除「来自网络」隔离标记，"
echo "之后才能双击 安装依赖.command / 启动.command。"
echo

# 去掉整个交付目录的 quarantine 属性
xattr -cr . 2>/dev/null || true

echo "已处理完成。"
echo
echo "下一步："
echo "  1. 双击「安装依赖.command」"
echo "  2. 再双击「启动.command」"
echo
echo "若仍被拦截：选中脚本 → 右键 → 打开 → 仍要打开"
echo
read -r -p "按回车键退出..."
