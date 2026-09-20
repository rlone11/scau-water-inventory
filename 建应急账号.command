#!/bin/bash
# ============================================================
# 建立应急管理员账号
#
# 用途：钉钉登录链路整个断掉时（回调域名失效、权限被撤、应用被停用），
#       靠这个账号还能进管理后台。平时不用，放着就行。
#
# 双击运行，不用敲任何命令。
# 你输的密码、以及服务密钥，全程都不会显示在屏幕上。
# ============================================================

cd "$(dirname "$0")" || exit 1

PROJECT_REF="rdmrplrlyojwugcxbqmj"

echo "=============================================="
echo "  建立应急管理员账号"
echo "=============================================="
echo ""
echo "  这个账号只在钉钉登不进来的时候用。"
echo "  邮箱不用真能收信，它只是个账号名。"
echo ""

read -r -p "邮箱（自己记得住就行）: " EMAIL
echo ""

if [ -z "$EMAIL" ]; then
  echo "❌ 邮箱不能为空。"
  read -n 1 -s -r -p "按任意键关闭这个窗口..."
  exit 1
fi

read -r -s -p "密码（自己记牢，别发给我）: " PASSWORD
echo ""
read -r -s -p "再输一遍: " PASSWORD2
echo ""

if [ "$PASSWORD" != "$PASSWORD2" ]; then
  echo ""
  echo "❌ 两次输入不一样，重来一次。"
  read -n 1 -s -r -p "按任意键关闭这个窗口..."
  exit 1
fi

if [ ${#PASSWORD} -lt 6 ]; then
  echo ""
  echo "❌ 密码至少 6 位。"
  read -n 1 -s -r -p "按任意键关闭这个窗口..."
  exit 1
fi

echo ""
echo "正在读取服务密钥（不会显示在屏幕上）..."

SERVICE_KEY=$(npx --yes supabase@latest projects api-keys \
    --project-ref "$PROJECT_REF" --output json 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(next(k['api_key'] for k in d if k.get('name') == 'service_role'))
except Exception:
    print('')
")

if [ -z "$SERVICE_KEY" ]; then
  echo ""
  echo "❌ 读不到服务密钥。"
  echo "   先双击运行一次「配置Supabase.command」完成登录，再回来跑这个。"
  read -n 1 -s -r -p "按任意键关闭这个窗口..."
  exit 1
fi

echo "正在创建账号……"
echo ""

# 用环境变量传，不走命令行参数 —— 参数会出现在进程列表里
export SCAU_REF="$PROJECT_REF"
export SCAU_KEY="$SERVICE_KEY"
export SCAU_EMAIL="$EMAIL"
export SCAU_PASSWORD="$PASSWORD"

python3 <<'PY'
import json, os, sys, urllib.request, urllib.error

ref  = os.environ["SCAU_REF"]
key  = os.environ["SCAU_KEY"]
mail = os.environ["SCAU_EMAIL"]
pw   = os.environ["SCAU_PASSWORD"]

base = f"https://{ref}.supabase.co/auth/v1/admin"
hdr  = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
}


def call(method, url, payload=None):
    """从不抛异常，失败返回 {'_error': ...}"""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return json.loads(body)
        except Exception:
            return {"_error": f"HTTP {e.code}: {body[:200]}"}
    except Exception as e:
        return {"_error": str(e)}


# app_metadata 是权限判定的依据 —— 数据库的 RLS 策略读的就是这个字段
app_meta = {"scau_role": "admin"}

# 先查这个邮箱是不是已经建过，建过就改，没建过才新建
listing = call("GET", f"{base}/users?per_page=1000")
if isinstance(listing, dict) and listing.get("_error"):
    print("❌ 读取用户列表失败：", listing["_error"])
    sys.exit(1)

users = listing.get("users") or []
existing = next((u for u in users if (u.get("email") or "").lower() == mail.lower()), None)

if existing:
    print("这个邮箱已经有账号了，更新它的密码和权限……")
    res = call("PUT", f"{base}/users/{existing['id']}",
               {"password": pw, "app_metadata": app_meta})
    action = "更新"
else:
    res = call("POST", f"{base}/users",
               {"email": mail, "password": pw, "email_confirm": True,
                "app_metadata": app_meta})
    action = "创建"

if not isinstance(res, dict) or res.get("_error") or not res.get("id"):
    print("❌ 失败：", res.get("_error") or res.get("msg") or res.get("message") or res)
    sys.exit(1)

print(f"✅ {action}成功")
print("   邮箱：", res.get("email"))
print("   角色：", (res.get("app_metadata") or {}).get("scau_role"))
print("   已确认：", "是" if res.get("email_confirmed_at") else "否")
PY

STATUS=$?

echo ""
if [ $STATUS -eq 0 ]; then
  echo "=============================================="
  echo "  ✅ 完成，回去跟 Claude 说一声就行"
  echo "=============================================="
else
  echo "=============================================="
  echo "  ❌ 没成功，把上面的输出截图发给 Claude"
  echo "=============================================="
fi
read -n 1 -s -r -p "按任意键关闭这个窗口..."
