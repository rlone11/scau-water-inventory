import { useState, useCallback, useEffect, useMemo } from 'react';
import type { BorrowRecord, BorrowStatus } from '../types';
import { generateId, nowISO } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchRecords, updateRecord } from '../services/recordService';
import { fetchItemById, updateItem } from '../services/itemService';
import { cacheClear } from '../lib/cache';
import { REFRESH_EVENT } from '../lib/events';

const RECORDS_LIMIT = 500;

export function useBorrowing() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<BorrowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 首次加载 + 自动标记逾期
  useEffect(() => {
    /**
     * 访客和内部人员读不到借用记录 —— 数据库里 borrow_records 的策略
     * 只放行管理员。所以这里连请求都不发：既省一次跨境往返（国内到悉尼
     * 本来就要好几秒），也免得在控制台刷一片 42501 权限错误。
     */
    if (!isAdmin) {
      setRecords([]);
      setError(null);
      setLoading(false);
      return;
    }

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
  }, [isAdmin]);

  // 监听全局刷新事件
  useEffect(() => {
    if (!isAdmin) return;

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
  }, [isAdmin]);

  /** 重新拉取记录。非管理员直接跳过 —— 他们没有读权限 */
  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    const data = await fetchRecords(RECORDS_LIMIT);
    setRecords(data);
  }, [isAdmin]);

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
      const optimisticRecord: BorrowRecord = {
        id: generateId(),
        ...data,
        status: 'borrowed',
      };

      // 乐观：立即插入本地列表
      setRecords((prev) => [optimisticRecord, ...prev]);

      try {
        /**
         * 走数据库函数而不是「建记录 + 改库存」两个并行请求。
         *
         * 三个原因：
         *  1. 访客没有表写权限（RLS 只放行管理员），只能从这条受控通道进
         *  2. 两个并行请求任一个失败就会账实不符 —— 有记录没扣库存，
         *     或者扣了库存没记录。RPC 是单事务，要么都成要么都不成
         *  3. 库存在函数里用 FOR UPDATE 加锁后重读，并发借用不会超借
         *
         * 顺带省掉一次 fetchItemById 往返 —— 国内访问悉尼本来就慢。
         */
        const { error } = await supabase.rpc('submit_borrow', {
          p_item_id: data.itemId,
          p_item_name: data.itemName,
          p_borrower_name: data.borrowerName,
          p_borrower_id: data.borrowerId,
          p_phone: data.phone,
          p_department: data.department,
          p_purpose: data.purpose,
          p_quantity: data.quantity,
          p_borrow_date: data.borrowDate,
          p_expected_return_date: data.expectedReturnDate,
        });

        if (error) throw error;

        /**
         * 后台静默刷新，失败不影响结果。
         *
         * ⚠️ 这里必须吞掉异常：写入已经成功了，如果 refresh 抛出去被下面的
         * catch 接住，会把乐观记录回滚、返回 false —— 界面说"没借成"，
         * 数据库里其实已经借出去了。访客刷新时被 RLS 拒绝就是这个场景。
         */
        await refresh().catch(() => {});
        return { ok: true };
      } catch (e) {
        console.error('借用失败:', e);
        // 回滚
        setRecords((prev) => prev.filter((r) => r.id !== optimisticRecord.id));
        // 把服务端的原话透出来 —— 「可借数量不足（当前 3 件）」
        // 比一句笼统的「请检查库存」有用得多
        return {
          ok: false,
          error: (e as { message?: string })?.message || '借出失败',
        };
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

        // 后台静默刷新，失败不影响结果（同上：写成功了就不该被刷新失败推翻）
        await refresh().catch(() => {});
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
