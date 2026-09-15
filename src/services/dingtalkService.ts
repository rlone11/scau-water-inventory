import { supabase } from '../lib/supabase';
import type { BorrowRecord } from '../types';
import { cacheInvalidate, CACHE_KEYS } from '../lib/cache';
import { rowToRecord } from './recordService';

/**
 * 钉钉审批对接的数据访问层。
 *
 * 数据流向：GitHub Actions 定时任务把钉钉审批写进 borrow_records，
 * 匹配上库存物品的带 item_id，匹配不上的 item_id 为空 —— 后者就是「待关联」。
 */

export interface SyncStatus {
  lastSyncAt: string | null;
  lastResult: string | null;
}

/**
 * 待关联记录：来自钉钉、但还没匹配到库存物品的那些。
 */
export async function fetchPendingMatches(): Promise<BorrowRecord[]> {
  const { data, error } = await supabase
    .from('borrow_records')
    .select('*')
    .not('dingtalk_instance_id', 'is', null)
    .is('item_id', null)
    .is('ignored_at', null)
    .order('borrow_date', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToRecord);
}

/**
 * 只取待关联数量 —— 给「借记记录」页的提示条用，不拉全量数据。
 */
export async function fetchPendingCount(): Promise<number> {
  const { count, error } = await supabase
    .from('borrow_records')
    .select('id', { count: 'exact', head: true })
    .not('dingtalk_instance_id', 'is', null)
    .is('item_id', null)
    .is('ignored_at', null);

  if (error) throw error;
  return count ?? 0;
}

/**
 * 已忽略的钉钉记录。
 *
 * 忽略不等于删除 —— 记录仍在库里，只是从待关联列表移走，
 * 随时可以恢复。这样"这条我不管了"这个决定本身也是有迹可循的。
 */
export async function fetchIgnoredMatches(): Promise<BorrowRecord[]> {
  const { data, error } = await supabase
    .from('borrow_records')
    .select('*')
    .not('dingtalk_instance_id', 'is', null)
    .not('ignored_at', 'is', null)
    .order('ignored_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToRecord);
}

/** 忽略一条待关联记录 —— 记下忽略时间 */
export async function ignoreRecord(recordId: string): Promise<void> {
  const { error } = await supabase
    .from('borrow_records')
    .update({ ignored_at: new Date().toISOString() })
    .eq('id', recordId);

  if (error) throw error;
  cacheInvalidate(CACHE_KEYS.RECORDS_LIST);
}

/** 撤销忽略，让它回到待关联列表 */
export async function restoreRecord(recordId: string): Promise<void> {
  const { error } = await supabase
    .from('borrow_records')
    .update({ ignored_at: null })
    .eq('id', recordId);

  if (error) throw error;
  cacheInvalidate(CACHE_KEYS.RECORDS_LIST);
}

/**
 * 读取同步状态（表里只有一行，id 固定为 1）。
 * 定时任务每跑一次就更新这一行。
 */
export async function fetchSyncStatus(): Promise<SyncStatus | null> {
  const { data, error } = await supabase
    .from('dingtalk_sync_status')
    .select('last_sync_at, last_result')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    lastSyncAt: (data.last_sync_at as string | null) ?? null,
    lastResult: (data.last_result as string | null) ?? null,
  };
}

/**
 * 把一条待关联记录关联到库存物品，并按记录里的数量扣减可借数量。
 *
 * 扣减有下界保护：不会低于 0。
 */
export async function linkRecordToItem(
  recordId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  // 1. 关联记录，并标记库存已扣 —— 重跑或再次关联时靠它避免重复扣减
  const { error: linkErr } = await supabase
    .from('borrow_records')
    .update({ item_id: itemId, stock_deducted: true })
    .eq('id', recordId);

  if (linkErr) throw linkErr;

  // 2. 原子扣减库存。
  //    不用「先读再写」是因为后台同步任务可能同时在扣同一件物品，
  //    读改写会互相覆盖、丢掉一次扣减。下界保护在函数内部（GREATEST(0, ...)）。
  const { error: stockErr } = await supabase.rpc('deduct_stock', {
    p_item_id: itemId,
    p_qty: quantity,
  });

  if (stockErr) throw stockErr;

  cacheInvalidate(CACHE_KEYS.RECORDS_LIST);
  cacheInvalidate(CACHE_KEYS.ITEMS_LIST);
  cacheInvalidate(CACHE_KEYS.ITEM_BY_ID(itemId));
}

export interface SyncRunResult {
  ok: boolean;
  /** 距离上次同步太近，本次被节流跳过 */
  throttled?: boolean;
  inserted?: number;
  skipped?: number;
  pending?: number;
  message?: string;
  error?: string;
}

/**
 * 触发一次钉钉同步。
 *
 * 同步必须跑在服务端（Supabase Edge Function）—— 它要用钉钉 AppSecret，
 * 而网站是公开的静态页面，密钥放进浏览器等于公开泄露。
 *
 * 之所以不依赖定时任务：实测本仓库的 GitHub cron 会被延迟 2~5 小时、
 * 甚至直接被丢弃且没有任何通知。改成「打开页面就同步」之后，
 * 拿到的一定是最新数据，且页面上不需要任何同步按钮。
 *
 * 函数内置 60 秒节流，反复刷新页面不会浪费钉钉接口额度。
 */
export async function triggerSync(): Promise<SyncRunResult> {
  const { data, error } = await supabase.functions.invoke('sync-dingtalk', { method: 'POST' });
  if (error) throw error;
  return (data ?? { ok: false }) as SyncRunResult;
}
