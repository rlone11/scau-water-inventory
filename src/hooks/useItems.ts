import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Item, ItemCategory } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchItemsLite, createItem, updateItem, deleteItem } from '../services/itemService';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 首次加载：用轻量查询，排除 photo/notes，大幅减少 payload
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

  const refresh = useCallback(async () => {
    const data = await fetchItemsLite();
    setItems(data);
  }, []);

  const addItem = useCallback(
    async (data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = nowISO();
      const newItem = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };
      await createItem(newItem);
      await refresh();
    },
    [refresh],
  );

  const updateOne = useCallback(
    async (id: string, data: Partial<Omit<Item, 'id' | 'createdAt'>>) => {
      await updateItem(id, { ...data, updatedAt: nowISO() });
      await refresh();
    },
    [refresh],
  );

  const removeItem = useCallback(
    async (id: string) => {
      await deleteItem(id);
      await refresh();
    },
    [refresh],
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

  // 稳定返回值引用，避免子组件不必要的 re-render
  return useMemo(
    () => ({ items, loading, error, addItem, updateItem: updateOne, deleteItem: removeItem, searchItems, refresh }),
    [items, loading, error, addItem, updateOne, removeItem, searchItems, refresh],
  );
}
