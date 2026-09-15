#!/usr/bin/env python3
"""
钉钉审批 → 网站 同步任务。

把钉钉里「物品借用」的审批结果拉下来，写进 Supabase 的 borrow_records。

设计要点：
  - 只同步 status=COMPLETED 且 result=agree 的审批（审批中/被拒的不进库）
  - 一条审批可借多件物品（表单里的「物品明细1」是表格字段），每行拆成一条记录，
    用 (实例ID, 行号) 做唯一键 —— 唯一索引起去重作用，重跑不会重复插入
  - 物品名称能高置信度匹配上库存的，自动关联并扣减可借数量；匹配不上的
    item_id 留空，在网站「钉钉审批」页人工关联（宁可多一次人工，不可错扣库存）
  - 任何致命错误都以非零退出码结束，让 GitHub Actions 标红

凭证来源：环境变量优先（CI 用 GitHub Secrets），
回落到仓库根的 .env.dingtalk.local（本地调试用）。

用法：
    python3 scripts/sync-dingtalk.py
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.dingtalk.local")

TIMEOUT = 20
TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
LIST_URL = "https://oapi.dingtalk.com/topapi/processinstance/listids"
DETAIL_URL = "https://oapi.dingtalk.com/topapi/processinstance/get"

# 往前拉多少天。定得比同步间隔（10 分钟）大得多，漏跑几次也不会丢数据。
SYNC_WINDOW_DAYS = 7

# 审批表单里的字段名（中文标签，直接来自钉钉返回的 form_component_values）
F_DEPT = "借用部门"
F_PHONE = "负责人联系电话"
F_PURPOSE = "物品用途"
F_TABLE = "物品明细1"
F_BORROWER = "负责人"
F_BORROW_DATE = "借用时间"
F_RETURN_DATE = "归还时间"
F_INTEGRITY = "物品完好性"

# 表格字段的子列
COL_NAME = "物品名称"
COL_QTY = "物品数量"


# ---------------------------------------------------------------- 基础工具

def load_env_file(path: str) -> dict:
    """解析 .env 格式文件。只认全大写变量名，值两侧的引号会被剥掉。"""
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


def load_config() -> dict:
    """环境变量优先，缺失的键回落到 .env.dingtalk.local。"""
    file_cfg = {}
    if os.path.exists(ENV_FILE):
        file_cfg = load_env_file(ENV_FILE)

    keys = (
        "DINGTALK_CLIENT_ID",
        "DINGTALK_CLIENT_SECRET",
        "DINGTALK_PROCESS_CODE",
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
    )
    return {k: (os.environ.get(k) or file_cfg.get(k, "")).strip() for k in keys}


# 失败时用它把状态写回数据库，让网站能看见「同步挂了」而不是一片安静
_sb: Optional["Supabase"] = None


def die(msg: str) -> None:
    """打印错误并以非零码退出 —— GitHub Actions 靠这个标红。"""
    print(f"❌ {msg}")
    if _sb is not None:
        _sb.update_sync_status(f"失败：{msg[:120]}")
    sys.exit(1)


def request_json(url: str, payload=None, token: str = "", method: str = "GET",
                 extra_headers: Optional[dict] = None) -> tuple:
    """统一的请求层：从不抛异常，一律返回 (状态码, 响应文本)。"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-acs-dingtalk-access-token"] = token
    if extra_headers:
        headers.update(extra_headers)

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"请求异常: {type(e).__name__}: {e}"


def parse_json(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------- 钉钉

def get_token(client_id: str, client_secret: str) -> str:
    """换 access_token。注意字段名是 appKey/appSecret，不是 clientId/clientSecret。"""
    status, body = request_json(
        TOKEN_URL, {"appKey": client_id, "appSecret": client_secret}, method="POST"
    )
    parsed = parse_json(body)
    token = parsed.get("accessToken") if isinstance(parsed, dict) else None
    if not token:
        die(f"换取 token 失败（HTTP {status}）：{body[:300]}")
    return token


def list_instance_ids(token: str, process_code: str) -> list:
    """列出时间窗内的审批实例 ID。"""
    now_ms = int(time.time() * 1000)
    day_ms = 24 * 60 * 60 * 1000
    status, body = request_json(
        f"{LIST_URL}?access_token={token}",
        {
            "process_code": process_code,
            "start_time": now_ms - SYNC_WINDOW_DAYS * day_ms,
            "end_time": now_ms,
        },
        method="POST",
    )
    parsed = parse_json(body)
    # 旧版 oapi 接口：成功与否看 body 里的 errcode，不是 HTTP 状态码
    if not isinstance(parsed, dict) or parsed.get("errcode") != 0:
        die(f"拉取审批实例列表失败（HTTP {status}）：{body[:300]}")
    return parsed.get("result", {}).get("list") or []


def get_instance(token: str, instance_id: str) -> Optional[dict]:
    """拉一条审批详情。单条失败返回 None，不中断整批。"""
    status, body = request_json(
        f"{DETAIL_URL}?access_token={token}",
        {"process_instance_id": instance_id},
        method="POST",
    )
    parsed = parse_json(body)
    if not isinstance(parsed, dict) or parsed.get("errcode") != 0:
        print(f"   ⚠️  实例 {instance_id} 详情拉取失败（HTTP {status}）：{body[:200]}")
        return None
    return parsed.get("process_instance")


def parse_form_values(inst: dict) -> dict:
    """把 form_component_values 展平成 {中文标签: 值}。"""
    return {
        fv.get("name", ""): fv.get("value", "")
        for fv in inst.get("form_component_values", [])
    }


def parse_table_rows(raw: Any) -> list:
    """解析「物品明细1」表格字段。

    真实结构是 JSON 字符串：[{"rowValue": [{"label": "物品名称", "value": "院旗"},
                                          {"label": "物品数量", "value": "1"}]}]
    一行 → 一条记录。解析不了就返回空列表（不猜，交给上层记日志）。
    """
    if not raw:
        return []
    try:
        rows = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    if not isinstance(rows, list):
        return []

    out = []
    for row in rows:
        cells = row.get("rowValue") if isinstance(row, dict) else None
        if not isinstance(cells, list):
            continue
        kv = {c.get("label"): c.get("value") for c in cells if isinstance(c, dict)}
        name = str(kv.get(COL_NAME) or "").strip()
        if not name:
            continue
        try:
            qty = int(str(kv.get(COL_QTY) or "1").strip())
        except ValueError:
            qty = 1
        out.append({"name": name, "qty": max(1, qty)})
    return out


# ---------------------------------------------------------------- Supabase

class Supabase:
    """极简 PostgREST 客户端 —— 只用标准库，不引第三方依赖。"""

    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def _call(self, method: str, path: str, payload=None, prefer: str = "") -> tuple:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        return request_json(f"{self.base}{path}", payload, method=method,
                            extra_headers=headers)

    def select(self, path: str) -> list:
        status, body = self._call("GET", path)
        parsed = parse_json(body)
        if status != 200 or not isinstance(parsed, list):
            die(f"查询失败 {path}（HTTP {status}）：{body[:300]}")
        return parsed

    def insert(self, table: str, rows: list) -> None:
        """插入；主键或唯一索引冲突时静默跳过（重跑安全）。"""
        status, body = self._call(
            "POST", f"/{table}", rows,
            prefer="resolution=ignore-duplicates,return=minimal",
        )
        if status not in (200, 201, 204):
            die(f"写入 {table} 失败（HTTP {status}）：{body[:300]}")

    def deduct_stock(self, item_id: str, qty: int) -> None:
        """调用数据库函数原子扣减可借数量（下界 0 在函数内部保证）。"""
        status, body = self._call(
            "POST", "/rpc/deduct_stock", {"p_item_id": item_id, "p_qty": qty}
        )
        if status not in (200, 204):
            print(f"   ⚠️  扣减库存失败 item={item_id} qty={qty}：{body[:200]}")

    def update_sync_status(self, result: str) -> None:
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        status, body = self._call(
            "PATCH", "/dingtalk_sync_status?id=eq.1",
            {"last_sync_at": now, "last_result": result},
            prefer="return=minimal",
        )
        if status not in (200, 204):
            print(f"   ⚠️  更新同步状态失败（HTTP {status}）：{body[:200]}")


# ---------------------------------------------------------------- 物品匹配

def normalize(name: str) -> str:
    """去掉所有空白字符，用于比较。"""
    return re.sub(r"\s+", "", name or "")


def match_item(raw_name: str, items: list) -> Optional[str]:
    """把审批里的物品名称匹配到库存物品。

    只在高置信度时返回 item_id，其余一律返回 None（留给人工关联）。
    实测审批里填的东西经常压根不在库存里（比如"院旗"），
    错配的代价远大于多一次人工确认 —— 宁可漏，不可错。
    """
    target = normalize(raw_name)
    if not target:
        return None

    exact = [i for i in items if normalize(i.get("name", "")) == target]
    if len(exact) == 1:
        return exact[0]["id"]

    # 双向包含，且较短的一方至少 2 个字（避免"包"匹配上一切带包的东西）
    partial = []
    for i in items:
        candidate = normalize(i.get("name", ""))
        if not candidate:
            continue
        shorter, longer = sorted([target, candidate], key=len)
        if len(shorter) >= 2 and shorter in longer:
            partial.append(i)
    if len(partial) == 1:
        return partial[0]["id"]

    # 多个候选 → 降级为待关联，交人工选
    return None


# ---------------------------------------------------------------- 主流程

def build_record(inst: dict, fields: dict, row: dict, row_index: int,
                 instance_id: str, item_id: Optional[str]) -> dict:
    """把一条审批里的一行物品，组装成 borrow_records 的一行。

    注意：NOT NULL 的列一律给字符串兜底，避免因钉钉少填一个字段整条写不进去。
    """
    integrity = str(fields.get(F_INTEGRITY) or "").strip()
    return {
        "id": f"dt-{instance_id}-{row_index}",
        "item_id": item_id,
        "item_name": row["name"],
        "borrower_name": str(fields.get(F_BORROWER) or "").strip() or "（未填写）",
        "borrower_id": str(inst.get("originator_userid") or ""),
        "phone": str(fields.get(F_PHONE) or "").strip(),
        "department": str(fields.get(F_DEPT) or inst.get("originator_dept_name") or "").strip(),
        "purpose": str(fields.get(F_PURPOSE) or "").strip(),
        "quantity": row["qty"],
        "borrow_date": str(fields.get(F_BORROW_DATE) or "").strip(),
        "expected_return_date": str(fields.get(F_RETURN_DATE) or "").strip(),
        "status": "borrowed",
        # 完好性填「完好」时不记损坏说明
        "damaged_note": "" if integrity in ("", "完好") else integrity,
        "dingtalk_instance_id": instance_id,
        "dingtalk_row_index": row_index,
        "stock_deducted": False,
    }


def main() -> None:
    cfg = load_config()
    missing = [k for k in ("DINGTALK_CLIENT_ID", "DINGTALK_CLIENT_SECRET",
                           "DINGTALK_PROCESS_CODE", "VITE_SUPABASE_URL",
                           "VITE_SUPABASE_ANON_KEY") if not cfg[k]]
    if missing:
        die(f"缺少配置：{', '.join(missing)}（环境变量或 .env.dingtalk.local）")

    print("=" * 56)
    print(f"钉钉审批同步 · 窗口 {SYNC_WINDOW_DAYS} 天")
    print("=" * 56)

    global _sb
    sb = Supabase(cfg["VITE_SUPABASE_URL"], cfg["VITE_SUPABASE_ANON_KEY"])
    _sb = sb  # 挂到模块级，后续 die() 才能把失败状态写回库里

    token = get_token(cfg["DINGTALK_CLIENT_ID"], cfg["DINGTALK_CLIENT_SECRET"])
    print("✅ 已换取 access_token")

    items = sb.select("/items?select=id,name,available_qty")
    print(f"✅ 库存物品 {len(items)} 件")

    instance_ids = list_instance_ids(token, cfg["DINGTALK_PROCESS_CODE"])
    print(f"✅ 时间窗内审批 {len(instance_ids)} 条")

    # 只查这批 ID 的已有记录，避免全表扫描
    if instance_ids:
        quoted = ",".join(f'"{i}"' for i in instance_ids)
        existing_rows = sb.select(
            f"/borrow_records?select=dingtalk_instance_id,dingtalk_row_index"
            f"&dingtalk_instance_id=in.({quoted})"
        )
    else:
        existing_rows = []
    existing = {
        (r["dingtalk_instance_id"], r["dingtalk_row_index"]) for r in existing_rows
    }
    print(f"✅ 库中已有钉钉记录 {len(existing)} 条")

    inserted = skipped = pending = 0
    for instance_id in instance_ids:
        inst = get_instance(token, instance_id)
        if inst is None:
            continue
        if inst.get("status") != "COMPLETED" or inst.get("result") != "agree":
            continue  # 审批中 / 被拒 / 已终止 —— 不进库

        fields = parse_form_values(inst)
        rows = parse_table_rows(fields.get(F_TABLE))
        if not rows:
            print(f"   ⚠️  审批 {inst.get('title') or instance_id} 的「{F_TABLE}」解析为空，已跳过")
            continue

        new_rows = []
        for idx, row in enumerate(rows):
            if (instance_id, idx) in existing:
                skipped += 1
                continue
            item_id = match_item(row["name"], items)
            if item_id is None:
                pending += 1
            new_rows.append(build_record(inst, fields, row, idx, instance_id, item_id))

        if not new_rows:
            continue

        sb.insert("/borrow_records", new_rows)

        # 高置信度匹配上的，扣减库存并标记；匹配失败的留待人工关联
        for row in new_rows:
            if row["item_id"] is not None:
                sb.deduct_stock(row["item_id"], row["quantity"])

        inserted += len(new_rows)

    summary = f"新增 {inserted} / 跳过 {skipped} / 待关联 {pending}"
    print()
    print("=" * 56)
    print(f"✅ 同步完成：{summary}")
    print("=" * 56)

    sb.update_sync_status(summary)


if __name__ == "__main__":
    main()
