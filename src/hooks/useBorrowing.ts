import { useState, useCallback, useEffect } from 'react';
import type { BorrowRecord } from '../types';
import { getRecords, saveRecords, generateId, nowISO, getItems, saveItems } from '../utils/storage';

export function useBorrowing() {
  const [records, setRecords] = useState<BorrowRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshRecords();
    setLoading(false);
  }, []);

  const refreshRecords = useCallback(() => {
    // Check for overdue items
    const raw = getRecords();
    const now = new Date();
    let changed = false;
    const updated = raw.map((r) => {
      if (
        r.status === 'borrowed' &&
        new Date(r.expectedReturnDate) < now
      ) {
        changed = true;
        return { ...r, status: 'overdue' as const };
      }
      return r;
    });
    if (changed) saveRecords(updated);
    setRecords(updated);
  }, []);

  const persist = useCallback((newRecords: BorrowRecord[]) => {
    setRecords(newRecords);
    saveRecords(newRecords);
  }, []);

  const borrowItem = useCallback(
    (data: {
      itemId: string;
      itemName: string;
      borrowerName: string;
      borrowerId: string;
      phone: string;
      department: string;
      purpose: string;
      quantity: number;
      borrowDate: string;
      expectedReturnDate: string;
    }) => {
      const items = getItems();
      const item = items.find((i) => i.id === data.itemId);
      if (!item || item.availableQty < data.quantity) {
        return false;
      }

      const record: BorrowRecord = {
        id: generateId(),
        ...data,
        status: 'borrowed',
      };
      persist([...getRecords(), record]);

      // Update item available quantity
      const updatedItems = items.map((i) =>
        i.id === data.itemId
          ? { ...i, availableQty: i.availableQty - data.quantity, updatedAt: nowISO() }
          : i,
      );
      saveItems(updatedItems);

      return true;
    },
    [persist],
  );

  const returnItem = useCallback(
    (recordId: string, damagedQty?: number, damagedNote?: string) => {
      const allRecords = getRecords();
      const record = allRecords.find((r) => r.id === recordId);
      if (!record || record.status === 'returned') return false;

      const now = nowISO();
      const safeDamagedQty = Math.min(damagedQty || 0, record.quantity);

      const updated = allRecords.map((r) =>
        r.id === recordId
          ? {
              ...r,
              status: 'returned' as const,
              actualReturnDate: now,
              damagedQty: safeDamagedQty > 0 ? safeDamagedQty : undefined,
              damagedNote: damagedNote || undefined,
            }
          : r,
      );
      persist(updated);

      // Update item quantities
      const items = getItems();
      const restoredQty = record.quantity - safeDamagedQty;
      saveItems(
        items.map((i) =>
          i.id === record.itemId
            ? {
                ...i,
                availableQty: i.availableQty + restoredQty,
                quantity: i.quantity - safeDamagedQty,
                updatedAt: now,
              }
            : i,
        ),
      );

      return true;
    },
    [persist],
  );

  const searchRecords = useCallback(
    (query: string, statusFilter?: string) => {
      let filtered = [...records];

      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.itemName.toLowerCase().includes(q) ||
            r.borrowerName.toLowerCase().includes(q) ||
            r.borrowerId.toLowerCase().includes(q),
        );
      }

      if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }

      return filtered;
    },
    [records],
  );

  return {
    records,
    loading,
    borrowItem,
    returnItem,
    searchRecords,
    refreshRecords,
  };
}
