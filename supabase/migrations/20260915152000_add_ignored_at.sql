-- 钉钉待关联记录的「忽略」标记。
--
-- 管理员遇到不想处理的待关联记录（重复单、测试数据、库存里压根不该有的东西）时
-- 可以忽略它 —— 记下忽略时间，从待关联列表里移走，但记录本身保留，随时可撤销。
ALTER TABLE borrow_records
  ADD COLUMN IF NOT EXISTS ignored_at TIMESTAMPTZ;

-- 待关联查询和忽略列表查询都按这一列过滤，加个索引
CREATE INDEX IF NOT EXISTS borrow_records_ignored_at_idx
  ON borrow_records (ignored_at)
  WHERE dingtalk_instance_id IS NOT NULL;
