#!/bin/bash
# ============================================================
# Supabase 一次性配置：登录 + 写入钉钉密钥
#
# 双击运行即可，不用敲任何命令。
# 密钥从 .env.dingtalk.local 读取，全程不会显示在屏幕上。
# ============================================================

cd "$(dirname "$0")" || exit 1

echo "=============================================="
echo "  Supabase 配置（只需运行这一次）"
echo "=============================================="
echo ""

# ---------- 1/2 登录 ----------
echo "【1/2】登录 Supabase"
echo "  浏览器会自动打开一个授权页面，点绿色的同意按钮就行。"
echo ""
echo "  （第一次运行要下载工具，可能要等一两分钟）"
echo ""

if ! npx --yes supabase@latest login; then
  echo ""
  echo "❌ 登录没成功。把上面的报错截图发给 Claude。"
  read -n 1 -s -r -p "按任意键关闭这个窗口..."
  exit 1
fi

echo ""
echo "【2/2】写入钉钉密钥"
echo "  从 .env.dingtalk.local 读取，不会显示在屏幕上。"
echo ""

set -a
source .env.dingtalk.local
set +a

if [ -z "$DINGTALK_CLIENT_ID" ] || [ -z "$DINGTALK_CLIENT_SECRET" ] || [ -z "$DINGTALK_PROCESS_CODE" ]; then
  echo "❌ .env.dingtalk.local 里有变量是空的，检查一下那个文件。"
  read -n 1 -s -r -p "按任意键关闭这个窗口..."
  exit 1
fi

if ! npx --yes supabase@latest secrets set \
    --project-ref rdmrplrlyojwugcxbqmj \
    DINGTALK_CLIENT_ID="$DINGTALK_CLIENT_ID" \
    DINGTALK_CLIENT_SECRET="$DINGTALK_CLIENT_SECRET" \
    DINGTALK_PROCESS_CODE="$DINGTALK_PROCESS_CODE"; then
  echo ""
  echo "❌ 写入密钥失败。把上面的报错截图发给 Claude。"
  read -n 1 -s -r -p "按任意键关闭这个窗口..."
  exit 1
fi

echo ""
echo "=============================================="
echo "  ✅ 全部完成！回去跟 Claude 说一声就行"
echo "=============================================="
read -n 1 -s -r -p "按任意键关闭这个窗口..."
