import { useState, useCallback, useEffect, useMemo } from 'react';
import type { BorrowRecord, BorrowStatus } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { fetchRecords, createRecord, updateRecord } from '../services/recordService';
import { fetchItemById, updateItem } from '../services/itemService';
import { cacheClear } from '../lib/cache';
import { REFRESH_EVENT } from '../lib/events';

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

  // 监听全局刷新事件
  useEffect(() => {
    const forceRefresh = async () => {
      cacheClear();
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRecords(RECORDS_LIMIT);
        setRecords(data);
        setLoading(false);
      } catch (err) {
        setError((err as Error).message || '刷新失败');
        setLoading(false);
      }
    };
    window.addEventListener(REFRESH_EVENT, forceRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, forceRefresh);
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchRecords(RECORDS_LIMIT);
    setRecords(data);
  }, []);

  // ---- 乐观借用 ----

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

      const optimisticRecord: BorrowRecord = {
        id: generateId(),
        ...data,
        status: 'borrowed',
      };

      // 乐观：立即插入本地列表
      setRecords((prev) => [optimisticRecord, ...prev]);

      try {
        // 并行：创建记录 + 扣减库存
        await Promise.all([
          createRecord(optimisticRecord),
          updateItem(data.itemId, {
            availableQty: item.availableQty - data.quantity,
          }),
        ]);
        // 后台静默刷新
        await refresh();
        return true;
      } catch {
        // 回滚
        setRecords((prev) => prev.filter((r) => r.id !== optimisticRecord.id));
        return false;
      }
    },
    [refresh],
  );

  // ---- 乐观归还 ----

  const returnItem = useCallback(
    async (recordId: string, consumedQty?: number, consumedNote?: string) => {
      // 先从当前列表找记录
      const record = records.find((r) => r.id === recordId);
      if (!record) return false;
      // 只有借出中/已逾期可以核销；已归还、已消耗、已忽略一律拒绝
      if (record.status !== 'borrowed' && record.status !== 'overdue') return false;

      const now = nowISO();
      const safeConsumedQty = Math.min(consumedQty || 0, record.quantity);
      /** 真正回到库存的件数 */
      const restoredQty = record.quantity - safeConsumedQty;
      /**
       * 一件都没回到库存 = 整条记录「已消耗」；
       * 部分消耗仍是「已归还」，消耗数量挂在 consumedQty 上单独显示。
       */
      const settledStatus: BorrowStatus = restoredQty === 0 ? 'consumed' : 'returned';

      // 尚未关联库存物品的记录无法归还 —— 不知道库存该还到哪件物品上。
      // 必须在乐观更新【之前】拦下：否则界面会先变成「已还」而这里直接 return，
      // 数据库纹丝不动，刷新才复原 —— 即"假归还"。
      const targetItemId = record.itemId;
      if (!targetItemId) return false;

      // 乐观：立即更新本地状态
      setRecords((prev) =>
        prev.map((r) =>
          r.id === recordId
            ? {
                ...r,
                status: settledStatus,
                // 核销时间。被消耗的记录并没有"归还日期"，这一列的实际含义是"记录结清时间"
                actualReturnDate: now,
                consumedQty: safeConsumedQty > 0 ? safeConsumedQty : undefined,
                consumedNote: consumedNote || undefined,
              }
            : r,
        ),
      );

      try {
        const item = await fetchItemById(targetItemId);
        if (!item) throw new Error('物品不存在');

        // 并行：更新记录 + 更新库存
        await Promise.all([
          updateRecord(recordId, {
            status: settledStatus,
            actualReturnDate: now,
            consumedQty: safeConsumedQty > 0 ? safeConsumedQty : undefined,
            consumedNote: consumedNote || undefined,
          }),
          updateItem(targetItemId, {
            // 消耗掉的部分不回补可借，直接从库存总数里扣掉
            availableQty: item.availableQty + restoredQty,
            quantity: item.quantity - safeConsumedQty,
          }),
        ]);

        // 后台静默刷新
        await refresh();
        return true;
      } catch {
        // 回滚到原始状态
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? { ...r, status: record.status, actualReturnDate: record.actualReturnDate, consumedQty: record.consumedQty, consumedNote: record.consumedNote }
              : r,
          ),
        );
        return false;
      }
    },
    [records, refresh],
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
