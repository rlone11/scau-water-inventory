/**
 * 钉钉审批同步 —— Supabase Edge Function
 *
 * 这里是唯一的生产实现：网站打开「钉钉审批」页时会调它，
 * 因此不受 GitHub Actions 定时器不可靠的影响
 * （实测本仓库的 GitHub cron 会被延迟 2~5 小时，甚至直接被丢弃）。
 *
 * 原先并存的 Python 版 scripts/sync-dingtalk.py + GitHub 定时器方案已于
 * 2026-09-16 移除 —— 两套逻辑同时跑会重复插入记录、重复扣库存。
 * 备份在：~/Downloads/claude code/备份/scau-water-inventory-旧同步方案-2026-09-16/
 *
 * 为什么必须放在服务端：同步要用钉钉 AppSecret，
 * 而网站是公开的静态页面，密钥放进浏览器等于公开泄露。
 *
 * 密钥来源：Supabase Edge Function 的环境变量（Deno.env）
 *   DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET / DINGTALK_PROCESS_CODE
 * SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自动注入。
 *
 * 安全：两道闸。
 *   1. 身份校验 —— 只放行 app_metadata.scau_role === 'admin' 的已登录用户。
 *      2026-09-20 之前这里是完全开放的，任何人都能触发同步。
 *   2. 节流 —— 60 秒内重复调用直接返回，避免合法用户反复刷新
 *      把钉钉每月 1 万次的免费额度耗光。
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TIMEOUT_MS = 20_000;
const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/accessToken';
const LIST_URL = 'https://oapi.dingtalk.com/topapi/processinstance/listids';
const DETAIL_URL = 'https://oapi.dingtalk.com/topapi/processinstance/get';

/** 往前拉多少天。定得比同步间隔大得多，漏跑几次也不会丢数据。 */
const SYNC_WINDOW_DAYS = 7;

/** 节流窗口：这个时间内的重复调用直接跳过（秒） */
const THROTTLE_SECONDS = 60;

// 审批表单里的字段名（中文标签，直接来自钉钉返回的 form_component_values）
const F_DEPT = '借用部门';
const F_PHONE = '负责人联系电话';
const F_PURPOSE = '物品用途';
const F_TABLE = '物品明细1';
const F_BORROWER = '负责人';
const F_BORROW_DATE = '借用时间';
const F_RETURN_DATE = '归还时间';
const F_INTEGRITY = '物品完好性';

const COL_NAME = '物品名称';
const COL_QTY = '物品数量';

// ────────────────────────────────────────────── 基础工具

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** 统一的请求封装：从不抛异常，一律返回 { status, text } */
async function requestJson(
  url: string,
  payload?: unknown,
  token = '',
  method = 'GET',
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-acs-dingtalk-access-token'] = token;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: 0, text: `请求异常: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────── 钉钉

/** 换 token。字段名是 appKey/appSecret，不是 clientId/clientSecret。 */
async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const { text } = await requestJson(
    TOKEN_URL,
    { appKey: clientId, appSecret: clientSecret },
    '',
    'POST',
  );
  const parsed = parseJson(text);
  const token = parsed?.accessToken;
  if (!token) throw new Error(`换取 token 失败：${text.slice(0, 200)}`);
  return token as string;
}

/** 列出时间窗内的审批实例 ID */
async function listInstanceIds(token: string, processCode: string): Promise<string[]> {
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const { status, text } = await requestJson(
    `${LIST_URL}?access_token=${token}`,
    {
      process_code: processCode,
      start_time: nowMs - SYNC_WINDOW_DAYS * dayMs,
      end_time: nowMs,
    },
    '',
    'POST',
  );
  const parsed = parseJson(text);
  // 旧版 oapi 接口：成功与否看 body 里的 errcode，不是 HTTP 状态码
  if (parsed?.errcode !== 0) {
    throw new Error(`拉取审批实例列表失败（HTTP ${status}）：${text.slice(0, 200)}`);
  }
  return (parsed?.result?.list ?? []) as string[];
}

/** 拉一条审批详情。单条失败返回 null，不中断整批。 */
async function getInstance(token: string, instanceId: string): Promise<any | null> {
  const { text } = await requestJson(
    `${DETAIL_URL}?access_token=${token}`,
    { process_instance_id: instanceId },
    '',
    'POST',
  );
  const parsed = parseJson(text);
  if (parsed?.errcode !== 0) return null;
  return parsed?.process_instance ?? null;
}

/** 把 form_component_values 展平成 { 中文标签: 值 } */
function parseFormValues(inst: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fv of inst?.form_component_values ?? []) {
    out[fv?.name ?? ''] = fv?.value ?? '';
  }
  return out;
}

/**
 * 解析「物品明细1」表格字段。
 * 真实结构：[{ rowValue: [{ label: '物品名称', value: '院旗' }, ...] }]
 * 解析不了就返回空数组（不猜，交给上层记日志）。
 */
function parseTableRows(raw: unknown): Array<{ name: string; qty: number }> {
  if (!raw) return [];
  let rows: any;
  try {
    rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];

  const out: Array<{ name: string; qty: number }> = [];
  for (const row of rows) {
    const cells = row?.rowValue;
    if (!Array.isArray(cells)) continue;
    const kv: Record<string, string> = {};
    for (const c of cells) kv[c?.label] = c?.value;
    const name = String(kv[COL_NAME] ?? '').trim();
    if (!name) continue;
    const parsedQty = parseInt(String(kv[COL_QTY] ?? '1').trim(), 10);
    out.push({ name, qty: Number.isFinite(parsedQty) ? Math.max(1, parsedQty) : 1 });
  }
  return out;
}

// ────────────────────────────────────────────── 物品匹配

/** 去掉所有空白字符，用于比较 */
function normalize(name: string): string {
  return (name || '').replace(/\s+/g, '');
}

/**
 * 把审批里的物品名称匹配到库存物品。
 *
 * 只在高置信度时返回 itemId，其余一律返回 null（留给人工关联）。
 * 实测审批里填的东西经常压根不在库存里（比如「院旗」），
 * 错配的代价远大于多一次人工确认 —— 宁可漏，不可错。
 */
function matchItem(rawName: string, items: Array<{ id: string; name: string }>): string | null {
  const target = normalize(rawName);
  if (!target) return null;

  const exact = items.filter((i) => normalize(i.name) === target);
  if (exact.length === 1) return exact[0].id;

  // 双向包含，且较短的一方至少 2 个字（避免「包」匹配上一切带包的东西）
  const partial = items.filter((i) => {
    const candidate = normalize(i.name);
    if (!candidate) return false;
    const [shorter, longer] =
      target.length <= candidate.length ? [target, candidate] : [candidate, target];
    return shorter.length >= 2 && longer.includes(shorter);
  });
  if (partial.length === 1) return partial[0].id;

  // 多个候选 → 降级为待关联，交人工选
  return null;
}

// ────────────────────────────────────────────── 主流程

interface SyncResult {
  inserted: number;
  skipped: number;
  pending: number;
}

async function runSync(): Promise<SyncResult> {
  const clientId = Deno.env.get('DINGTALK_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('DINGTALK_CLIENT_SECRET') ?? '';
  const processCode = Deno.env.get('DINGTALK_PROCESS_CODE') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const missing = [
    ['DINGTALK_CLIENT_ID', clientId],
    ['DINGTALK_CLIENT_SECRET', clientSecret],
    ['DINGTALK_PROCESS_CODE', processCode],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`缺少配置：${missing.join(', ')}（在 Supabase Edge Function 的 Secrets 里设置）`);
  }

  const sb = createClient(supabaseUrl, serviceKey);

  const { data: items, error: itemsErr } = await sb
    .from('items')
    .select('id, name, available_qty');
  if (itemsErr) throw new Error(`读取库存失败：${itemsErr.message}`);

  const token = await getToken(clientId, clientSecret);
  const instanceIds = await listInstanceIds(token, processCode);

  // 只查这批 ID 的已有记录，避免全表扫描
  let existing = new Set<string>();
  if (instanceIds.length) {
    const { data: existingRows } = await sb
      .from('borrow_records')
      .select('dingtalk_instance_id, dingtalk_row_index')
      .in('dingtalk_instance_id', instanceIds);
    existing = new Set(
      (existingRows ?? []).map((r: any) => `${r.dingtalk_instance_id}#${r.dingtalk_row_index}`),
    );
  }

  const result: SyncResult = { inserted: 0, skipped: 0, pending: 0 };

  for (const instanceId of instanceIds) {
    const inst = await getInstance(token, instanceId);
    if (!inst) continue;
    // 审批中 / 被拒 / 已终止 —— 不进库
    if (inst.status !== 'COMPLETED' || inst.result !== 'agree') continue;

    const fields = parseFormValues(inst);
    const rows = parseTableRows(fields[F_TABLE]);
    if (rows.length === 0) continue;

    const newRows: any[] = [];
    for (let idx = 0; idx < rows.length; idx++) {
      if (existing.has(`${instanceId}#${idx}`)) {
        result.skipped++;
        continue;
      }
      const row = rows[idx];
      const itemId = matchItem(row.name, (items ?? []) as any);
      if (itemId === null) result.pending++;

      const integrity = String(fields[F_INTEGRITY] ?? '').trim();
      newRows.push({
        id: `dt-${instanceId}-${idx}`,
        item_id: itemId,
        item_name: row.name,
        borrower_name: String(fields[F_BORROWER] ?? '').trim() || '（未填写）',
        borrower_id: String(inst.originator_userid ?? ''),
        phone: String(fields[F_PHONE] ?? '').trim(),
        department: String(fields[F_DEPT] ?? inst.originator_dept_name ?? '').trim(),
        purpose: String(fields[F_PURPOSE] ?? '').trim(),
        quantity: row.qty,
        borrow_date: String(fields[F_BORROW_DATE] ?? '').trim(),
        expected_return_date: String(fields[F_RETURN_DATE] ?? '').trim(),
        status: 'borrowed',
        // 完好性填「完好」时不记损坏说明
        damaged_note: integrity === '' || integrity === '完好' ? '' : integrity,
        dingtalk_instance_id: instanceId,
        dingtalk_row_index: idx,
        stock_deducted: false,
      });
    }

    if (newRows.length === 0) continue;

    // 唯一索引 (dingtalk_instance_id, dingtalk_row_index) 会让重复插入直接跳过
    const { error: insertErr } = await sb
      .from('borrow_records')
      .upsert(newRows, { onConflict: 'dingtalk_instance_id,dingtalk_row_index', ignoreDuplicates: true });
    if (insertErr) throw new Error(`写入借用记录失败：${insertErr.message}`);

    // 高置信度匹配上的，扣减库存并标记；匹配失败的留待人工关联
    for (const row of newRows) {
      if (row.item_id === null) continue;
      await sb.rpc('deduct_stock', { p_item_id: row.item_id, p_qty: row.quantity });
      await sb.from('borrow_records').update({ stock_deducted: true }).eq('id', row.id);
    }

    result.inserted += newRows.length;
  }

  const summary = `新增 ${result.inserted} / 跳过 ${result.skipped} / 待关联 ${result.pending}`;
  await sb
    .from('dingtalk_sync_status')
    .update({ last_sync_at: new Date().toISOString(), last_result: summary })
    .eq('id', 1);

  return result;
}

// ────────────────────────────────────────────── 入口

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const sb = createClient(supabaseUrl, serviceKey);

    // ── 身份校验 ──────────────────────────────────────────────
    // 这个接口以前是公网匿名可调的，唯一防护是下面的 60 秒节流。
    // 但它用 service_role 写库（绕过 RLS），必须确认调用者真的是管理员 ——
    // 否则任何人都能反复触发同步、耗光钉钉每月 1 万次的免费额度。
    // supabase.functions.invoke 会自动带上当前会话的 JWT。
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!callerToken) {
      return json({ ok: false, error: '需要管理员权限' }, 401);
    }

    const { data: authData } = await sb.auth.getUser(callerToken);
    if (authData?.user?.app_metadata?.scau_role !== 'admin') {
      return json({ ok: false, error: '需要管理员权限' }, 401);
    }

    // 节流：刚同步过就直接返回，避免被反复调用耗光钉钉额度
    const { data: statusRow } = await sb
      .from('dingtalk_sync_status')
      .select('last_sync_at, last_result')
      .eq('id', 1)
      .maybeSingle();

    const lastSync = statusRow?.last_sync_at ? new Date(statusRow.last_sync_at as string) : null;
    const ageSeconds = lastSync ? (Date.now() - lastSync.getTime()) / 1000 : Infinity;

    if (ageSeconds < THROTTLE_SECONDS) {
      return json({
        ok: true,
        throttled: true,
        message: `刚刚同步过（${Math.round(ageSeconds)} 秒前），跳过`,
        lastResult: statusRow?.last_result ?? null,
      });
    }

    const result = await runSync();
    return json({
      ok: true,
      throttled: false,
      ...result,
      message: `新增 ${result.inserted} / 跳过 ${result.skipped} / 待关联 ${result.pending}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // 把失败写回库，网站上的同步状态就会变红，不至于静默失败
    try {
      const sb = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      await sb
        .from('dingtalk_sync_status')
        .update({ last_result: `失败：${message.slice(0, 120)}` })
        .eq('id', 1);
    } catch { /* 写状态失败就算了，别掩盖原始错误 */ }

    return json({ ok: false, error: message }, 500);
  }
});
