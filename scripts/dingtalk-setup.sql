-- ============================================================
-- 钉钉审批对接 · 数据库初始化
--
-- 在 Supabase 的 SQL Editor 里执行一次即可。
-- 包含：表结构改动 + 一条真实审批数据的测试样本。
-- ============================================================

-- ---------- 1. 允许「还没匹配上」的记录存在 ----------
-- 钉钉同步过来但没匹配到库存物品的记录，item_id 为空
ALTER TABLE borrow_records ALTER COLUMN item_id DROP NOT NULL;

-- ---------- 2. 记录这条数据来自钉钉的哪张审批、第几行 ----------
-- 一条审批单可以借多件物品（表单里的「物品明细」是表格），
-- 每行生成一条借用记录，所以唯一键必须是「实例 ID + 行号」
ALTER TABLE borrow_records ADD COLUMN IF NOT EXISTS dingtalk_instance_id TEXT;
ALTER TABLE borrow_records ADD COLUMN IF NOT EXISTS dingtalk_row_index INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS borrow_records_dingtalk_uniq
  ON borrow_records (dingtalk_instance_id, dingtalk_row_index);

-- ---------- 3. 同步状态表（固定只有一行，id = 1）----------
CREATE TABLE IF NOT EXISTS dingtalk_sync_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_sync_at TIMESTAMPTZ,
  last_result TEXT
);

INSERT INTO dingtalk_sync_status (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 权限：沿用项目现有风格（后续收紧安全时统一处理）
ALTER TABLE dingtalk_sync_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on dingtalk_sync_status" ON dingtalk_sync_status;
CREATE POLICY "Allow all on dingtalk_sync_status"
  ON dingtalk_sync_status FOR ALL USING (true) WITH CHECK (true);

-- ---------- 4. 测试数据：用你那条真实审批 ----------
-- 陈舒可 借 院旗 1 件（2026-09-09 审批通过的真实记录）
INSERT INTO borrow_records (
  id, item_id, item_name, borrower_name, borrower_id, phone,
  department, purpose, quantity, borrow_date, expected_return_date,
  status, dingtalk_instance_id, dingtalk_row_index
) VALUES (
  'test-dingtalk-1',
  NULL,                                  -- 故意留空，模拟"未匹配到库存物品"
  '院旗',
  '陈舒可',
  '435913303638025317',
  '15208454503',
  '实践部',
  '社会实践总结交流会',
  1,
  '2026-09-10',
  '2026-09-12',
  'borrowed',
  'KUqXdAiBR0W1Ifgg_NkyYQ09841788923228',
  0
) ON CONFLICT DO NOTHING;

-- ---------- 验证 ----------
SELECT '表结构已就绪' AS 状态;
SELECT id, item_name, borrower_name, quantity, item_id IS NULL AS 待关联
  FROM borrow_records WHERE dingtalk_instance_id IS NOT NULL;
