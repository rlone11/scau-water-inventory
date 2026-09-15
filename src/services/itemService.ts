import { supabase } from '../lib/supabase';
import type { Item, ItemCategory } from '../types';
import { cacheGet, cacheSet, cacheInvalidate, cacheInvalidatePrefix, CACHE_KEYS } from '../lib/cache';
import { nextCode } from '../lib/itemCode';

/** Postgres 唯一约束冲突错误码 */
const UNIQUE_VIOLATION = '23505';

/** 编号冲突时展示给用户的文案 */
export const CODE_CONFLICT_MESSAGE = '该编号已存在，请更换';

/** 自动编号因并发冲突时的最大重试次数 */
const MAX_AUTO_CODE_ATTEMPTS = 3;

// 列表快速查询：排除 photo（base64大字段）和 notes，保证首屏秒开
const LIST_COLUMNS = 'id, name, code, category, quantity, available_qty, location, created_at, updated_at';

// Map DB column names (snake_case) to JS fields (camelCase)
function rowToItem(row: Record<string, unknown>): Item {
  return {
    id: row.id as string,
    name: row.name as string,
    code: row.code as string,
    category: row.category as ItemCategory,
    quantity: row.quantity as number,
    availableQty: row.available_qty as number,
    location: row.location as string,
    photo: row.photo as string | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function itemToRow(item: Partial<Item> & { id: string }): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  // 只包含明确传入的字段，避免 undefined 覆盖数据库已有值
  const map: [string, unknown][] = [
    ['id', item.id],
    ['name', item.name],
    ['code', item.code],
    ['category', item.category],
    ['quantity', item.quantity],
    ['available_qty', item.availableQty],
    ['location', item.location],
    ['photo', item.photo],
    ['notes', item.notes],
    ['created_at', item.createdAt],
    ['updated_at', item.updatedAt],
  ];
  for (const [key, val] of map) {
    if (val !== undefined) row[key] = val === null ? null : val;
  }
  return row;
}

// ===== 缓存辅助 =====

function invalidateItemsCache(): void {
  cacheInvalidate(CACHE_KEYS.ITEMS_LIST);
  cacheInvalidatePrefix('items:photo:');
}

function invalidateItemCache(id: string): void {
  cacheInvalidate(CACHE_KEYS.ITEM_BY_ID(id));
  cacheInvalidate(CACHE_KEYS.ITEM_PHOTO(id));
}

// ===== 查询 =====

/** 轻量查询：列表页用，排除 photo 和 notes，带缓存 */
export async function fetchItemsLite(limit = 200): Promise<Item[]> {
  // 先查缓存
  const cached = cacheGet<Item[]>(CACHE_KEYS.ITEMS_LIST);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('items')
    .select(LIST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const items = (data ?? []).map(rowToItem);
  cacheSet(CACHE_KEYS.ITEMS_LIST, items);
  return items;
}

/**
 * 按 ID 拉取【单条】物品的图片。
 *
 * 刻意只查 id 和 photo 两列：列表页按视口逐条加载图片，
 * 一次只传一张（约 73KB，约 0.5 秒），滚到哪张哪张先出来。
 * 相比过去一次性拉取全部（809KB / 4.5 秒）——那期间一张都显示不出来。
 *
 * @returns 该物品的图片 base64；无图片返回 null
 */
export async function fetchItemPhoto(id: string): Promise<string | null> {
  const cached = cacheGet<string | null>(CACHE_KEYS.ITEM_PHOTO(id));
  if (cached !== null) return cached;

  const { data, error } = await supabase
    .from('items')
    .select('id, photo')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const photo = (data?.photo as string | undefined) ?? null;
  cacheSet(CACHE_KEYS.ITEM_PHOTO(id), photo, 60_000);
  return photo;
}

/** 按 ID 查单个物品（全字段），带缓存 */
export async function fetchItemById(id: string): Promise<Item | null> {
  const cacheKey = CACHE_KEYS.ITEM_BY_ID(id);
  const cached = cacheGet<Item>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const item = rowToItem(data as Record<string, unknown>);
  cacheSet(cacheKey, item, 60_000); // 单个物品缓存 60 秒
  return item;
}

/**
 * 查询当前最大编号并返回下一个可用编号。
 *
 * 刻意不使用 TTL 缓存：若读取缓存数据，刚删除物品后会算出已被占用的编号。
 */
export async function fetchNextCode(): Promise<string> {
  const { data, error } = await supabase.from('items').select('code');
  if (error) throw error;
  return nextCode((data ?? []).map((r) => r.code as string));
}

// ===== 变更（自动失效缓存） =====

/**
 * 新建物品。
 *
 * options.autoCode 为 true 时（编号由系统自动填入），若因并发导致编号冲突，
 * 会自动重新取号并重试，用户无感。
 *
 * options.autoCode 为 false 时（用户手动指定编号），冲突直接抛出
 * CODE_CONFLICT_MESSAGE —— 绝不静默改号，否则用户输入 005 却存成 007。
 */
export async function createItem(
  input: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> & { id: string; createdAt: string; updatedAt: string },
  options?: { autoCode?: boolean },
): Promise<Item> {
  const maxAttempts = options?.autoCode ? MAX_AUTO_CODE_ATTEMPTS : 1;
  let lastError: Error = new Error(CODE_CONFLICT_MESSAGE);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = attempt === 0 ? input.code : await fetchNextCode();
    const row = itemToRow({ ...input, code });
    const { data, error } = await supabase
      .from('items')
      .insert(row)
      .select()
      .single();

    if (!error) {
      invalidateItemsCache();
      return rowToItem(data as Record<string, unknown>);
    }
    if (error.code !== UNIQUE_VIOLATION) throw error;
    lastError = new Error(CODE_CONFLICT_MESSAGE);
  }

  throw lastError;
}

export async function updateItem(id: string, updates: Partial<Item>): Promise<void> {
  const row = itemToRow({ id, ...updates });
  const { error } = await supabase
    .from('items')
    .update(row)
    .eq('id', id);

  if (error) throw error;
  invalidateItemsCache();
  invalidateItemCache(id);
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id);

  if (error) throw error;
  invalidateItemsCache();
  invalidateItemCache(id);
}
