-- ============================================================
-- 登录门禁 —— 数据库层上锁
--
-- 背景：此前三张表的策略都是 `Allow all → public`，而 anon key 就打包在
-- 公开的 JS 里，等于任何人打开控制台就能读走 borrow_records 里
-- 全院借用人的姓名和手机号。前端登录页只是障眼法，真正的门必须在这里。
--
-- 角色模型（存在 JWT 的 app_metadata.scau_role 里，由 dingtalk-login 签发）：
--   admin    管理员 —— 全权限
--   internal 学院内部人员（钉钉扫码但不在管理员名单）—— 与访客同权，仅身份可信
--   （访客 / 未登录）—— 只能读 items，读不到任何借用记录
--
-- 应用方式（不要用 db push，直连 5432 在国内必然失败）：
--   npx --yes supabase@latest db query --linked -f supabase/migrations/20260920000000_auth_rls.sql
-- ============================================================

-- ────────────────────────────────────────────── 权限判定

-- 放在 public schema 里，策略和函数体都要用
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    -- 管理员：钉钉登录时由 Edge Function 写进 app_metadata
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'scau_role', '') = 'admin'
    -- 服务端一律放行。Edge Function 用 service_role 调 deduct_stock，
    -- 不加这条会把钉钉同步自己挡掉
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ────────────────────────────────────────────── items：谁都能看，只有管理员能改

DROP POLICY IF EXISTS "Allow all on items" ON public.items;
DROP POLICY IF EXISTS "items_select_all" ON public.items;
DROP POLICY IF EXISTS "items_insert_admin" ON public.items;
DROP POLICY IF EXISTS "items_update_admin" ON public.items;
DROP POLICY IF EXISTS "items_delete_admin" ON public.items;

-- 读：含未登录访客。库存和物品图片本来就是要给借用人看的
CREATE POLICY "items_select_all" ON public.items
  FOR SELECT
  USING (true);

-- 写：仅管理员。TO authenticated 排除了 anon（两个角色是平级的，不是继承关系）
CREATE POLICY "items_insert_admin" ON public.items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "items_update_admin" ON public.items
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "items_delete_admin" ON public.items
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────── borrow_records：只有管理员

DROP POLICY IF EXISTS "Allow all on borrow_records" ON public.borrow_records;
DROP POLICY IF EXISTS "borrow_records_admin_all" ON public.borrow_records;

-- 这一条就是本次改动最重要的收益：手机号不再对所有人可见
CREATE POLICY "borrow_records_admin_all" ON public.borrow_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────── dingtalk_sync_status：只有管理员读

DROP POLICY IF EXISTS "Allow all on dingtalk_sync_status" ON public.dingtalk_sync_status;
DROP POLICY IF EXISTS "dingtalk_sync_status_admin_read" ON public.dingtalk_sync_status;

CREATE POLICY "dingtalk_sync_status_admin_read" ON public.dingtalk_sync_status
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 写由 sync-dingtalk 用 service_role 完成，service_role 绕过 RLS，不需要策略

-- ────────────────────────────────────────────── 管理员名单

-- 这张表是「钉钉用户登记表」而不是单纯的管理员名单：
-- 每个扫码进来过的人都会在这里留一行（role 默认 internal），
-- 你把某个人的 role 改成 'admin' 他就成了管理员。
-- auth_user_id 指向 auth.users.id —— dingtalk-login 靠它定位已有账号，
-- 免得每次登录都要翻页列全部用户。手填 openId 提前加管理员时可以为空。
CREATE TABLE IF NOT EXISTS public.staff_roles (
  dingtalk_open_id TEXT PRIMARY KEY,
  role             TEXT NOT NULL DEFAULT 'internal',
  auth_user_id     TEXT,
  name             TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 已存在的老表补列（这张表是本次新建的，纯属防御）
ALTER TABLE public.staff_roles ADD COLUMN IF NOT EXISTS auth_user_id TEXT;

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

-- 显式授权：新表不保证继承了默认权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_roles TO authenticated;

DROP POLICY IF EXISTS "staff_roles_admin_all" ON public.staff_roles;
CREATE POLICY "staff_roles_admin_all" ON public.staff_roles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- dingtalk-login 用 service_role 查这张表定角色，绕过 RLS

-- ────────────────────────────────────────────── 堵后门：deduct_stock

-- 它是 SECURITY DEFINER，函数体以定义者身份跑，不受 RLS 约束 ——
-- 就算上面把表锁死了，任何人拿 anon key 调这个 RPC 照样能改库存。
-- 两重加固：函数体内自己判权限 + 收回 anon 的执行权。
CREATE OR REPLACE FUNCTION public.deduct_stock(p_item_id TEXT, p_qty INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_qty INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '权限不足：扣减库存仅限管理员';
  END IF;

  UPDATE public.items
     SET available_qty = GREATEST(0, available_qty - GREATEST(0, p_qty))
   WHERE id = p_item_id
  RETURNING available_qty INTO new_qty;

  RETURN new_qty;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_stock(TEXT, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.deduct_stock(TEXT, INTEGER) TO authenticated, service_role;

-- ────────────────────────────────────────────── 借用提交（访客与内部人员）

-- 访客没有表写权限（borrow_records 的策略只放行管理员），
-- 但网站上借东西要「直接扣库存」，所以给一条受控的写入通道。
--
-- 为什么不走 Edge Function：Edge Function 要多绕一趟悉尼（国内 1~3 秒），
-- 而这里是单次 RPC，还天然原子 —— 现在前端是「建记录 + 扣库存」两个
-- 并行请求，任一个失败就账实不符。收紧后所有借用都走这里。
--
-- 为什么是 SECURITY DEFINER：调用者没有表权限，必须提权执行。
-- 因此函数体内对入参一律不信任，逐项校验。
CREATE OR REPLACE FUNCTION public.submit_borrow(
  p_item_id              TEXT,
  p_item_name            TEXT,
  p_borrower_name        TEXT,
  p_borrower_id          TEXT,
  p_phone                TEXT,
  p_department           TEXT,
  p_purpose              TEXT,
  p_quantity             INTEGER,
  p_borrow_date          TEXT,
  p_expected_return_date TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_id  TEXT;
  avail   INTEGER;
BEGIN
  -- ── 入参校验：边界处不信任任何输入
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100000 THEN
    RAISE EXCEPTION '借用数量不合法';
  END IF;
  IF COALESCE(btrim(p_borrower_name), '') = '' THEN
    RAISE EXCEPTION '借用人姓名不能为空';
  END IF;
  IF COALESCE(btrim(p_phone), '') = '' THEN
    RAISE EXCEPTION '联系电话不能为空';
  END IF;
  IF length(p_borrower_name) > 100 OR length(p_phone) > 50 OR length(p_purpose) > 500 THEN
    RAISE EXCEPTION '提交内容过长';
  END IF;

  -- ── 行锁：防并发超借。两个请求同时读到同一份库存时，后者会等锁，
  --    拿到锁后重读，就能看到前一个已经扣过了。
  SELECT available_qty INTO avail
    FROM public.items WHERE id = p_item_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '物品不存在';
  END IF;
  IF avail < p_quantity THEN
    RAISE EXCEPTION '可借数量不足（当前 % 件）', avail;
  END IF;

  -- ── 写记录 + 扣库存，同一事务，要么都成要么都不成
  new_id := 'br' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.borrow_records (
    id, item_id, item_name, borrower_name, borrower_id, phone, department,
    purpose, quantity, borrow_date, expected_return_date, status, stock_deducted
  ) VALUES (
    new_id, p_item_id, p_item_name, p_borrower_name,
    COALESCE(NULLIF(btrim(p_borrower_id), ''), p_phone),
    p_phone, p_department, p_purpose, p_quantity,
    p_borrow_date, p_expected_return_date, 'borrowed', TRUE
  );

  UPDATE public.items
     SET available_qty = avail - p_quantity,
         updated_at    = NOW()
   WHERE id = p_item_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_borrow(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT
) FROM public;

-- 访客（anon）也要能借东西，这是唯一刻意向未登录用户开放的写入口
GRANT EXECUTE ON FUNCTION public.submit_borrow(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT
) TO anon, authenticated, service_role;

-- ────────────────────────────────────────────── 验收自检

SELECT '策略清单' AS 项目, tablename || ' → ' || policyname || ' (' || cmd || ')' AS 内容
  FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'deduct_stock 权限', COALESCE(array_to_string(proacl, ', '), '(默认)')
  FROM pg_proc WHERE proname = 'deduct_stock'
UNION ALL
SELECT 'staff_roles', '存在' WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'staff_roles'
);
