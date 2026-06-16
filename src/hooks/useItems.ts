import { useState, useCallback, useEffect } from 'react';
import type { Item, ItemCategory } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchItems, createItem, updateItem, deleteItem } from '../services/itemService';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Load from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    fetchItems()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load items:', err);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchItems();
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

  return { items, loading, addItem, updateItem: updateOne, deleteItem: removeItem, searchItems };
}
