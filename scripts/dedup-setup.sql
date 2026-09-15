-- ============================================================
-- 钉钉同步 · 补充数据库变更
--
-- 在 Supabase 的 SQL Editor 里执行一次即可（可重复执行，跑两遍不会报错）。
-- 包含：防重复扣库存的标记列 + 原子扣减函数。
-- ============================================================

-- ---------- 1. 记录「这条记录的库存已经扣过了」----------
-- 同步任务重跑、以及人工在网站上关联物品时，都要看这一列，
-- 否则同一件东西可能被扣两次。
ALTER TABLE borrow_records
  ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT false;

-- ---------- 2. 原子扣减库存函数 ----------
-- 为什么需要它：如果先查当前数量、再整体覆写（读-改-写），
-- 后台同步任务和页面上的操作同时发生时会互相覆盖、丢掉一次扣减。
-- 这个函数把读改写放在一条 UPDATE 里，由数据库保证原子性。
-- GREATEST(0, ...) 是下界保护：可借数量永远不会变成负数。
CREATE OR REPLACE FUNCTION deduct_stock(p_item_id TEXT, p_qty INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_qty INTEGER;
BEGIN
  UPDATE items
     SET available_qty = GREATEST(0, available_qty - GREATEST(0, p_qty))
   WHERE id = p_item_id
  RETURNING available_qty INTO new_qty;

  RETURN new_qty;
END;
$$;

-- ---------- 验证 ----------
SELECT '补充变更已就绪' AS 状态;
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'borrow_records' AND column_name = 'stock_deducted';
