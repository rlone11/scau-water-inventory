/**
 * 简易 TTL 内存缓存 — 针对高延迟 Supabase 场景优化
 *
 * 策略：
 * - 默认 TTL 30 秒，列表数据短期缓存避免重复请求
 * - 写操作后自动失效对应缓存键
 * - 支持手动失效（刷新按钮）
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** 默认缓存 30 秒，足够覆盖页面切换 */
const DEFAULT_TTL = 30_000;

/** 写入缓存 */
export function cacheSet<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  store.set(key, { data, timestamp: Date.now(), ttl });
}

/** 读取缓存，过期返回 null */
export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

/** 失效指定缓存键 */
export function cacheInvalidate(key: string): void {
  store.delete(key);
}

/** 失效所有以 prefix 开头的缓存键（用于批量失效） */
export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** 清空全部缓存 */
export function cacheClear(): void {
  store.clear();
}

/** 获取缓存条目数量（调试用） */
export function cacheSize(): number {
  return store.size;
}

// ===== 预定义缓存键常量 =====
export const CACHE_KEYS = {
  ITEMS_LIST: 'items:list',
  ITEM_BY_ID: (id: string) => `items:${id}`,
  RECORDS_LIST: 'records:list',
} as const;
