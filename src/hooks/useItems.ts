import { useState, useCallback, useEffect } from 'react';
import type { Item, ItemCategory } from '../types';
import { getItems, saveItems, generateId, nowISO } from '../utils/storage';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setItems(getItems());
    setLoading(false);
  }, []);

  const persist = useCallback((newItems: Item[]) => {
    setItems(newItems);
    saveItems(newItems);
  }, []);

  const addItem = useCallback(
    (data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = nowISO();
      const newItem: Item = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };
      persist([...items, newItem]);
    },
    [items, persist],
  );

  const updateItem = useCallback(
    (id: string, data: Partial<Omit<Item, 'id' | 'createdAt'>>) => {
      const updated = items.map((item) =>
        item.id === id
          ? { ...item, ...data, updatedAt: nowISO() }
          : item,
      );
      persist(updated);
    },
    [items, persist],
  );

  const deleteItem = useCallback(
    (id: string) => {
      persist(items.filter((item) => item.id !== id));
    },
    [items, persist],
  );

  const searchItems = useCallback(
    (query: string, category?: ItemCategory | 'all', statusFilter?: 'all' | 'available' | 'borrowed') => {
      let filtered = [...items];

      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.code.toLowerCase().includes(q),
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

  return {
    items,
    loading,
    addItem,
    updateItem,
    deleteItem,
    searchItems,
  };
}
