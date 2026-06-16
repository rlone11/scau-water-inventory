import { supabase } from '../lib/supabase';
import type { Item, ItemCategory } from '../types';
import { cacheGet, cacheSet, cacheInvalidate, CACHE_KEYS } from '../lib/cache';

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
  cacheInvalidate(CACHE_KEYS.ITEMS_PHOTOS);
}

function invalidateItemCache(id: string): void {
  cacheInvalidate(CACHE_KEYS.ITEM_BY_ID(id));
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

/** 兼容旧接口：等同 fetchItemsLite */
export async function fetchItems(): Promise<Item[]> {
  return fetchItemsLite(500);
}

/** 单独拉取图片映射 { id → photo } — 在列表加载完成后异步调用 */
export async function fetchItemPhotos(): Promise<Map<string, string>> {
  const cached = cacheGet<Map<string, string>>(CACHE_KEYS.ITEMS_PHOTOS);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('items')
    .select('id, photo')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.photo) map.set(row.id as string, row.photo as string);
  }
  cacheSet(CACHE_KEYS.ITEMS_PHOTOS, map, 60_000); // 图片缓存 60 秒
  return map;
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

// ===== 变更（自动失效缓存） =====

export async function createItem(
  input: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> & { id: string; createdAt: string; updatedAt: string },
): Promise<Item> {
  const row = itemToRow(input);
  const { data, error } = await supabase
    .from('items')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  invalidateItemsCache();
  return rowToItem(data as Record<string, unknown>);
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
