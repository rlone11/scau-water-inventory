#!/usr/bin/env python3
"""
钉钉连通性验证脚本 —— 第 1 步：确认 Client ID / Client Secret 能否换取 access_token。

⚠️ 安全约定：本脚本全程【不打印任何密钥内容】，
   Client Secret 只输出长度，access_token 只输出掩码。

用法：
    python3 scripts/verify-dingtalk.py
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.dingtalk.local")

TIMEOUT = 20


def load_env(path: str) -> dict:
    """读取 .env 格式的配置文件。"""
    if not os.path.exists(path):
        print(f"❌ 找不到配置文件：{path}")
        sys.exit(1)

    cfg = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r'^([A-Z_]+)\s*=\s*"?(.*?)"?\s*$', line)
            if m:
                cfg[m.group(1)] = m.group(2)
    return cfg


def post_json(url: str, payload: dict) -> tuple:
    """POST JSON，返回 (状态码, 响应体文本)。"""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"请求异常: {type(e).__name__}: {e}"


def get_json(url: str) -> tuple:
    """GET，返回 (状态码, 响应体文本)。"""
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"请求异常: {type(e).__name__}: {e}"


def mask_token(tok: str) -> str:
    if not tok:
        return "(空)"
    if len(tok) <= 16:
        return "***"
    return f"{tok[:8]}...{tok[-4:]} (长度 {len(tok)})"


def main() -> None:
    cfg = load_env(ENV_FILE)

    client_id = cfg.get("DINGTALK_CLIENT_ID", "").strip()
    client_secret = cfg.get("DINGTALK_CLIENT_SECRET", "").strip()

    print("=" * 60)
    print("钉钉凭证读取情况")
    print("=" * 60)
    print(f"  Client ID     : {client_id or '❌ 未填写'}")
    print(f"  Client Secret : {'✅ 已填写，长度 ' + str(len(client_secret)) if client_secret else '❌ 未填写'}")
    print()

    if not client_id or not client_secret:
        print("❌ 凭证不完整，请先把 Client Secret 填入 .env.dingtalk.local")
        sys.exit(1)

    # 依次尝试已知的换取 access_token 的端点。
    # 钉钉把 AppKey/AppSecret 改名成了 Client ID/Secret，新旧字段名可能不同，故一并试。
    attempts = [
        (
            "新端点 · clientId/clientSecret 字段",
            "https://api.dingtalk.com/v1.0/oauth2/accessToken",
            {"clientId": client_id, "clientSecret": client_secret},
        ),
        (
            "新端点 · appKey/appSecret 字段（旧字段名）",
            "https://api.dingtalk.com/v1.0/oauth2/accessToken",
            {"appKey": client_id, "appSecret": client_secret},
        ),
        (
            "旧端点 · GET gettoken",
            f"https://oapi.dingtalk.com/gettoken?appkey={client_id}&appsecret={client_secret}",
            None,
        ),
    ]

    print("=" * 60)
    print("依次尝试换取 access_token")
    print("=" * 60)

    for idx, (label, url, payload) in enumerate(attempts, 1):
        print(f"\n【尝试 {idx}】{label}")

        if payload is None:
            status, body = get_json(url)
        else:
            status, body = post_json(url, payload)

        # 输出响应（响应体里可能含 token，需掩码后再打印）
        try:
            parsed = json.loads(body)
            safe = dict(parsed)
            if "accessToken" in safe:
                safe["accessToken"] = mask_token(str(safe["accessToken"]))
                print("   ✅ 成功！")
                print(f"   HTTP {status}")
                print(f"   响应: {json.dumps(safe, ensure_ascii=False, indent=2)}")
                print("\n" + "=" * 60)
                print("🎉 凭证有效，接口打通了！")
                print("=" * 60)
                return
            if "access_token" in safe:
                safe["access_token"] = mask_token(str(safe["access_token"]))
                print("   ✅ 成功！")
                print(f"   HTTP {status}")
                print(f"   响应: {json.dumps(safe, ensure_ascii=False, indent=2)}")
                print("\n" + "=" * 60)
                print("🎉 凭证有效，接口打通了！")
                print("=" * 60)
                return
            print(f"   ❌ HTTP {status}")
            print(f"   响应: {json.dumps(safe, ensure_ascii=False)}")
        except json.JSONDecodeError:
            print(f"   ❌ HTTP {status}")
            print(f"   响应: {body[:400]}")

    print("\n" + "=" * 60)
    print("❌ 三个端点都没能换到 token")
    print("=" * 60)
    print("请把上面的错误信息发给我，我据此判断是权限没开、还是字段名又改了。")


if __name__ == "__main__":
    main()
