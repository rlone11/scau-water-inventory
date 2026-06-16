import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Item, ItemCategory } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchItemsLite, fetchItemPhotos, createItem, updateItem, deleteItem } from '../services/itemService';
import { cacheClear } from '../lib/cache';
import { REFRESH_EVENT } from '../lib/events';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ===== 首次加载：两阶段 =====
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // 阶段 1：快速加载列表（不含 photo，秒开）
    fetchItemsLite()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false); // 列表就绪，UI 立即渲染

        // 阶段 2：后台拉取图片，静默合并
        fetchItemPhotos()
          .then((photoMap) => {
            if (cancelled || photoMap.size === 0) return;
            setItems((prev) =>
              prev.map((item) => {
                const photo = photoMap.get(item.id);
                return photo ? { ...item, photo } : item;
              }),
            );
          })
          .catch((err) => console.error('图片加载失败（列表仍可用）:', err));
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
    const handler = () => {
      cacheClear();
      setLoading(true);
      setError(null);
      fetchItemsLite()
        .then((data) => {
          setItems(data);
          setLoading(false);
          return fetchItemPhotos();
        })
        .then((photoMap) => {
          if (!photoMap || photoMap.size === 0) return;
          setItems((prev) =>
            prev.map((item) => {
              const photo = photoMap.get(item.id);
              return photo ? { ...item, photo } : item;
            }),
          );
        })
        .catch((err) => {
          console.error('刷新失败:', err);
          setError((err as Error).message || '刷新失败');
          setLoading(false);
        });
    };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchItemsLite();
      setItems(data);
      // 后台拉图片
      const photoMap = await fetchItemPhotos();
      if (photoMap.size > 0) {
        setItems((prev) =>
          prev.map((item) => {
            const photo = photoMap.get(item.id);
            return photo ? { ...item, photo } : item;
          }),
        );
      }
    } catch {
      // 静默失败 — 保留旧数据
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

      setItems((prev) => [optimisticItem, ...prev]);

      try {
        await createItem(optimisticItem);
        await refresh();
      } catch (err) {
        setItems((prev) => prev.filter((item) => item.id !== optimisticItem.id));
        throw err;
      }
    },
    [refresh],
  );

  const updateOne = useCallback(
    async (id: string, data: Partial<Omit<Item, 'id' | 'createdAt'>>) => {
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
      searchItems, refresh,
    }),
    [items, loading, error, addItem, updateOne, removeItem, searchItems, refresh],
  );
}
