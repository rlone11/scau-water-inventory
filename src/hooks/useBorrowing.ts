import { useState, useCallback, useEffect, useMemo } from 'react';
import type { BorrowRecord } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchRecords, createRecord, updateRecord } from '../services/recordService';
import { fetchItemById, updateItem } from '../services/itemService';

const RECORDS_LIMIT = 500;

export function useBorrowing() {
  const [records, setRecords] = useState<BorrowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 首次加载 + 自动标记逾期
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRecords(RECORDS_LIMIT)
      .then(async (data) => {
        if (cancelled) return;
        setRecords(data);
        setLoading(false);

        // 并行标记逾期记录
        const now = new Date();
        const overdueIds = data
          .filter((r) => r.status === 'borrowed' && new Date(r.expectedReturnDate) < now)
          .map((r) => r.id);

        if (overdueIds.length > 0) {
          await Promise.all(
            overdueIds.map((id) => updateRecord(id, { status: 'overdue' }).catch(console.error)),
          );

          // 更新本地状态
          if (!cancelled) {
            setRecords((prev) =>
              prev.map((r) =>
                overdueIds.includes(r.id) ? { ...r, status: 'overdue' as const } : r,
              ),
            );
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load records:', err);
        if (!cancelled) {
          setError(err.message || '加载失败');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchRecords(RECORDS_LIMIT);
    setRecords(data);
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
      // 检查库存
      const item = await fetchItemById(data.itemId);
      if (!item || item.availableQty < data.quantity) {
        return false;
      }

      const record: BorrowRecord = {
        id: generateId(),
        ...data,
        status: 'borrowed',
      };

      // 创建记录 + 扣减库存（可并行）
      await Promise.all([
        createRecord(record),
        updateItem(data.itemId, {
          availableQty: item.availableQty - data.quantity,
        }),
      ]);

      // 刷新本地状态
      await refresh();
      return true;
    },
    [refresh],
  );

  const returnItem = useCallback(
    async (recordId: string, damagedQty?: number, damagedNote?: string) => {
      const allRecords = await fetchRecords(RECORDS_LIMIT);
      const record = allRecords.find((r) => r.id === recordId);
      if (!record || record.status === 'returned') return false;

      const now = nowISO();
      const safeDamagedQty = Math.min(damagedQty || 0, record.quantity);

      const item = await fetchItemById(record.itemId);
      if (!item) return false;

      const restoredQty = record.quantity - safeDamagedQty;

      // 更新记录 + 更新库存 并行执行
      await Promise.all([
        updateRecord(recordId, {
          status: 'returned',
          actualReturnDate: now,
          damagedQty: safeDamagedQty > 0 ? safeDamagedQty : undefined,
          damagedNote: damagedNote || undefined,
        }),
        updateItem(record.itemId, {
          availableQty: item.availableQty + restoredQty,
          quantity: item.quantity - safeDamagedQty,
        }),
      ]);

      // 刷新本地状态
      await refresh();
      return true;
    },
    [refresh],
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

  return useMemo(
    () => ({
      records, loading, error,
      borrowItem, returnItem, searchRecords,
      refreshRecords: refresh,
    }),
    [records, loading, error, borrowItem, returnItem, searchRecords, refresh],
  );
}
