import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Item, ItemCategory } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchItemsLite, createItem, updateItem, deleteItem } from '../services/itemService';
import { cacheClear } from '../lib/cache';
import { REFRESH_EVENT } from '../lib/events';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 首次加载：用轻量查询（含缓存）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchItemsLite()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load items:', err);
        if (!cancelled) {
          setError(err.message || '加载失败');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // 监听全局刷新事件
  useEffect(() => {
    const handler = () => { forceRefresh(); };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 强制刷新（跳过缓存） */
  const forceRefresh = useCallback(async () => {
    cacheClear();
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItemsLite();
      setItems(data);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message || '刷新失败');
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchItemsLite();
      setItems(data);
    } catch {
      // 静默失败 — 缓存可能过期但保留旧数据
    }
  }, []);

  // ---- 乐观更新 ----

  const addItem = useCallback(
    async (data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = nowISO();
      const optimisticItem: Item = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      // 乐观：立即插入本地列表
      setItems((prev) => [optimisticItem, ...prev]);

      try {
        await createItem(optimisticItem);
        // 后台静默刷新（从缓存拿会很快）
        await refresh();
      } catch (err) {
        // 回滚
        setItems((prev) => prev.filter((item) => item.id !== optimisticItem.id));
        throw err;
      }
    },
    [refresh],
  );

  const updateOne = useCallback(
    async (id: string, data: Partial<Omit<Item, 'id' | 'createdAt'>>) => {
      // 保存快照用于回滚
      let snapshot: Item | undefined;
      setItems((prev) => {
        const idx = prev.findIndex((item) => item.id === id);
        if (idx === -1) return prev;
        snapshot = { ...prev[idx] };
        const updated = [...prev];
        updated[idx] = { ...prev[idx], ...data, updatedAt: nowISO() };
        return updated;
      });

      try {
        await updateItem(id, { ...data, updatedAt: nowISO() });
        await refresh();
      } catch {
        // 回滚
        if (snapshot) {
          setItems((prev) => {
            const idx = prev.findIndex((item) => item.id === id);
            if (idx === -1) return [...prev, snapshot!];
            const reverted = [...prev];
            reverted[idx] = snapshot!;
            return reverted;
          });
        }
        throw new Error('更新失败，请重试');
      }
    },
    [refresh],
  );

  const removeItem = useCallback(
    async (id: string) => {
      let snapshot: Item | undefined;
      setItems((prev) => {
        const idx = prev.findIndex((item) => item.id === id);
        if (idx === -1) return prev;
        snapshot = { ...prev[idx] };
        return prev.filter((item) => item.id !== id);
      });

      try {
        await deleteItem(id);
      } catch {
        // 回滚
        if (snapshot) {
          setItems((prev) => [...prev, snapshot!]);
        }
        throw new Error('删除失败，请重试');
      }
    },
    [],
  );

  const searchItems = useCallback(
    (query: string, category?: ItemCategory | 'all', statusFilter?: 'all' | 'available' | 'borrowed') => {
      let filtered = [...items];
      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(
          (item) => item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q),
        );
      }
      if (category && category !== 'all') {
        filtered = filtered.filter((item) => item.category === category);
      }
      if (statusFilter === 'available') {
        filtered = filtered.filter((item) => item.availableQty > 0);
      } else if (statusFilter === 'borrowed') {
        filtered = filtered.filter((item) => item.availableQty < item.quantity);
      }
      return filtered;
    },
    [items],
  );

  return useMemo(
    () => ({
      items, loading, error,
      addItem, updateItem: updateOne, deleteItem: removeItem,
      searchItems, refresh, forceRefresh,
    }),
    [items, loading, error, addItem, updateOne, removeItem, searchItems, refresh, forceRefresh],
  );
}
