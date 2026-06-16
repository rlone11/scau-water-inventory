import { useState, useCallback, useEffect } from 'react';
import type { BorrowRecord } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchRecords, createRecord, updateRecord } from '../services/recordService';
import { fetchItemById, fetchItems, updateItem } from '../services/itemService';

export function useBorrowing() {
  const [records, setRecords] = useState<BorrowRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Load from Supabase
  useEffect(() => {
    let cancelled = false;
    fetchRecords()
      .then((data) => {
        if (!cancelled) {
          setRecords(data);
          setLoading(false);
          // Mark overdue in memory
          refreshOverdue(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load records:', err);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const refreshOverdue = useCallback(async (existing?: BorrowRecord[]) => {
    const list = existing ?? (await fetchRecords());
    const now = new Date();
    let changed = false;
    const updated = list.map((r) => {
      if (r.status === 'borrowed' && new Date(r.expectedReturnDate) < now) {
        changed = true;
        // Persist overdue status to Supabase
        updateRecord(r.id, { status: 'overdue' }).catch(console.error);
        return { ...r, status: 'overdue' as const };
      }
      return r;
    });
    setRecords(updated);
    // Swallow error silently — just reflect in UI
    void changed;
  }, []);

  const borrowItem = useCallback(
    async (data: {
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
      // Check stock from Supabase
      const item = await fetchItemById(data.itemId);
      if (!item || item.availableQty < data.quantity) {
        return false;
      }

      const record: BorrowRecord = {
        id: generateId(),
        ...data,
        status: 'borrowed',
      };

      // Create record + decrement stock
      await createRecord(record);
      await updateItem(data.itemId, {
        availableQty: item.availableQty - data.quantity,
      });

      // Refresh local state
      const freshRecords = await fetchRecords();
      setRecords(freshRecords);

      return true;
    },
    [],
  );

  const returnItem = useCallback(
    async (recordId: string, damagedQty?: number, damagedNote?: string) => {
      const allRecords = await fetchRecords();
      const record = allRecords.find((r) => r.id === recordId);
      if (!record || record.status === 'returned') return false;

      const now = nowISO();
      const safeDamagedQty = Math.min(damagedQty || 0, record.quantity);

      // Update record
      await updateRecord(recordId, {
        status: 'returned',
        actualReturnDate: now,
        damagedQty: safeDamagedQty > 0 ? safeDamagedQty : undefined,
        damagedNote: damagedNote || undefined,
      });

      // Update item quantities
      const item = await fetchItemById(record.itemId);
      if (item) {
        const restoredQty = record.quantity - safeDamagedQty;
        await updateItem(record.itemId, {
          availableQty: item.availableQty + restoredQty,
          quantity: item.quantity - safeDamagedQty,
        });
      }

      // Refresh local state
      const freshRecords = await fetchRecords();
      setRecords(freshRecords);

      return true;
    },
    [],
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
    refreshRecords: () => refreshOverdue(),
  };
}
