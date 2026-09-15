#!/usr/bin/env python3
"""
钉钉对接验证 · 第 2 步：确认能否读取【审批数据】。

第 1 步（换取 access_token）已通过。本脚本验证第 2 步：
用 processCode 拉取审批模板详情与审批实例。

⚠️ 全程不打印 Client Secret；access_token 只输出掩码。

用法：
    python3 scripts/verify-dingtalk-approval.py
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.dingtalk.local")

TIMEOUT = 20
TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken"


def load_env(path: str) -> dict:
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


def request_json(url: str, payload=None, token: str = "", method: str = "GET") -> tuple:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-acs-dingtalk-access-token"] = token

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"请求异常: {type(e).__name__}: {e}"


def get_token(client_id: str, client_secret: str) -> str:
    status, body = request_json(
        TOKEN_URL,
        {"appKey": client_id, "appSecret": client_secret},
        method="POST",
    )
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        print(f"❌ 换取 token 失败：HTTP {status}")
        sys.exit(1)

    token = parsed.get("accessToken")
    if not token:
        print(f"❌ 换取 token 失败：{json.dumps(parsed, ensure_ascii=False)}")
        sys.exit(1)
    return token


def main() -> None:
    cfg = load_env(ENV_FILE)
    client_id = cfg.get("DINGTALK_CLIENT_ID", "").strip()
    client_secret = cfg.get("DINGTALK_CLIENT_SECRET", "").strip()
    process_code = cfg.get("DINGTALK_PROCESS_CODE", "").strip()

    print("=" * 60)
    print("配置检查")
    print("=" * 60)
    print(f"  Client ID    : {client_id}")
    print(f"  Process Code : {process_code or '❌ 未填写'}")

    if not process_code:
        print("\n❌ 请先把 processCode 填入 .env.dingtalk.local 的 DINGTALK_PROCESS_CODE")
        sys.exit(1)

    print("\n  正在换取 access_token ...")
    token = get_token(client_id, client_secret)
    print(f"  ✅ 拿到 token（长度 {len(token)}）")

    now_ms = int(time.time() * 1000)
    day_ms = 24 * 60 * 60 * 1000

    # 依次尝试几个已知的审批相关端点，看哪个通、哪个没权限
    # flavor: "new" = v1.0 风格（token 放 header，成功看 HTTP 200）
    #         "old" = oapi 风格（token 放 query，成功看 body 里的 errcode == 0）
    attempts = [
        (
            "获取审批模板详情（验证 processCode 是否正确）",
            f"https://api.dingtalk.com/v1.0/workflow/processes/managements/templates?processCode={process_code}",
            None,
            "GET",
            "new",
        ),
        (
            "获取审批表单 schema（看表单字段长什么样）",
            f"https://api.dingtalk.com/v1.0/workflow/forms/schemas/processCodes?processCode={process_code}",
            None,
            "GET",
            "new",
        ),
        (
            "查询审批实例 ID 列表（拉最近 30 天）",
            f"https://oapi.dingtalk.com/topapi/processinstance/listids?access_token={token}",
            {
                "process_code": process_code,
                "start_time": now_ms - 30 * day_ms,
                "end_time": now_ms,
            },
            "POST",
            "old",
        ),
    ]

    print()
    print("=" * 60)
    print("依次尝试审批相关接口")
    print("=" * 60)

    success_count = 0
    schema_json = None
    instance_ids = None
    for idx, (label, url, payload, method, flavor) in enumerate(attempts, 1):
        print(f"\n【{idx}】{label}")
        # 旧版 API 的 token 走 query 参数，已在 url 里拼好，不再放 header
        status, body = request_json(
            url, payload, token="" if flavor == "old" else token, method=method
        )

        try:
            parsed = json.loads(body)
            pretty = json.dumps(parsed, ensure_ascii=False, indent=2)
        except json.JSONDecodeError:
            pretty = body[:600]

        # 判断成功：新版看 HTTP 200，旧版看 errcode == 0
        ok = (status == 200) if flavor == "new" else (
            isinstance(parsed, dict) and parsed.get("errcode") == 0
        )

        if ok:
            print(f"   ✅ HTTP {status}")
            success_count += 1
            print("   " + pretty[:2000].replace("\n", "\n   "))
            # 第 2 个接口是表单 schema —— 留到后面解析出干净的字段清单
            if idx == 2 and isinstance(parsed, dict):
                schema_json = parsed
            # 第 3 个接口是实例 ID 列表 —— 留到后面拉一条详情
            if idx == 3 and isinstance(parsed, dict):
                instance_ids = parsed.get("result", {}).get("list") or []
        else:
            print(f"   ❌ HTTP {status}")
            print("   " + pretty[:900].replace("\n", "\n   "))

    # ===== 单独把表单字段列成一张干净的表 =====
    if schema_json:
        print()
        print("=" * 60)
        print("审批表单字段清单（设计数据映射的依据）")
        print("=" * 60)

        def walk(items, depth=0):
            for it in items or []:
                props = it.get("props", {})
                label = props.get("label")
                fid = props.get("id")
                comp = it.get("componentName", "")
                if label:
                    req = "必填" if props.get("required") else "选填"
                    print(f"  {'  ' * depth}- {label:<16} [{req}]  id={fid}  类型={comp}")
                if it.get("children"):
                    walk(it["children"], depth + 1)

        content = schema_json.get("result", {}).get("schemaContent", {})
        print(f"  模板标题：{content.get('title', '(无)')}")
        print()
        walk(content.get("items"))

    # ===== 拉一条真实审批实例的详情 —— 这一步成功就说明整条链路全通了 =====
    if instance_ids:
        iid = instance_ids[0]
        print()
        print("=" * 60)
        print("拉取一条真实审批实例详情")
        print("=" * 60)
        print(f"  实例 ID：{iid}")
        print()

        status, body = request_json(
            f"https://oapi.dingtalk.com/topapi/processinstance/get?access_token={token}",
            {"process_instance_id": iid},
            method="POST",
        )
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = None

        if isinstance(parsed, dict) and parsed.get("errcode") == 0:
            inst = parsed.get("process_instance", {})
            print(f"  审批标题  : {inst.get('title')}")
            print(f"  发起人 ID : {inst.get('originator_userid')}")
            print(f"  发起部门  : {inst.get('originator_dept_name')}")
            print(f"  状态      : {inst.get('status')}   (RUNNING=审批中 / COMPLETED=已完成 / TERMINATED=已终止)")
            print(f"  审批结果  : {inst.get('result')}   (agree=同意 / refuse=拒绝)")
            print(f"  发起时间  : {inst.get('create_time')}")
            print(f"  完成时间  : {inst.get('finish_time')}")
            print()
            print("  【表单实际填写内容】")
            for fv in inst.get("form_component_values", []):
                print(f"    {fv.get('name')}: {fv.get('value')}")
            print()
            print("=" * 60)
            print("🎉🎉 整条链路全通了！从钉钉读数据 → 字段映射 → 写进网站，技术上没有障碍了")
            print("=" * 60)
        else:
            print("  ❌ 拉取失败：")
            print("  " + body[:900])

    print()
    print("=" * 60)
    if success_count > 0:
        print(f"🎉 有 {success_count}/{len(attempts)} 个接口调通了")
        print("请把完整输出发给我，我据此设计字段映射")
    else:
        print("❌ 三个接口都没通")
        print("多半是【权限没申请】—— 去「权限管理」搜索「审批」并开通")
    print("=" * 60)


if __name__ == "__main__":
    main()
