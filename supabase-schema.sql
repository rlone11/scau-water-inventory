-- ===== 物品表 =====
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  available_qty INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT '',
  photo TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== 借记记录表 =====
CREATE TABLE borrow_records (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  item_name TEXT NOT NULL,
  borrower_name TEXT NOT NULL,
  borrower_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  department TEXT NOT NULL,
  purpose TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  borrow_date TEXT NOT NULL,
  expected_return_date TEXT NOT NULL,
  actual_return_date TEXT,
  status TEXT NOT NULL DEFAULT 'borrowed',
  damaged_qty INTEGER,
  damaged_note TEXT
);

-- ===== 允许匿名读写 =====
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on items" ON items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE borrow_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on borrow_records" ON borrow_records FOR ALL USING (true) WITH CHECK (true);
