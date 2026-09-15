import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Item, ItemCategory } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchItemsLite, fetchItemPhoto, createItem, updateItem, deleteItem } from '../services/itemService';
import { cacheClear } from '../lib/cache';
import { REFRESH_EVENT } from '../lib/events';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 正在请求中的图片 id —— 防止同一张图被重复并发请求 */
  const inFlightPhotoRef = useRef<Set<string>>(new Set());

  // ===== 首次加载：两阶段 =====
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // 列表查询不含 photo 列（base64 大字段），先渲染出结构
    // 图片改由列表页按视口逐条加载 —— 滚到哪张，哪张先出来
    fetchItemsLite()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
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
    } catch {
      // 静默失败 — 保留旧数据
    }
  }, []);

  /**
   * 按需加载单条物品的图片 —— 由列表页在卡片进入视口时调用。
   *
   * 同一张图不会并发重复请求；服务层有 60 秒缓存，页面来回切换也不会重拉。
   */
  const loadPhoto = useCallback(async (id: string) => {
    if (inFlightPhotoRef.current.has(id)) return;
    inFlightPhotoRef.current.add(id);
    try {
      const photo = await fetchItemPhoto(id);
      if (!photo) return;
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, photo } : item)),
      );
    } catch {
      // 单张图片拉取失败不影响列表可用性
    } finally {
      inFlightPhotoRef.current.delete(id);
    }
  }, []);

  // ---- 乐观更新 ----

  const addItem = useCallback(
    async (
      data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>,
      options?: { autoCode?: boolean },
    ) => {
      const now = nowISO();
      const optimisticItem: Item = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      setItems((prev) => [optimisticItem, ...prev]);

      try {
        await createItem(optimisticItem, options);
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
      searchItems, refresh, loadPhoto,
    }),
    [items, loading, error, addItem, updateOne, removeItem, searchItems, refresh, loadPhoto],
  );
}
