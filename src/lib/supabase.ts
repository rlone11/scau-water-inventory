import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

/**
 * ⚠️ anon key 是公开的 —— 它会被打包进 JS，任何人都能看到。
 * 数据库的安全性完全依赖 RLS 策略，不依赖这个 key 的保密性。
 * 见 supabase/migrations/20260920000000_auth_rls.sql
 *
 * 会话配置：
 * - detectSessionInUrl 关掉 —— 我们不用魔法链接/邮件确认这些回跳方式，
 *   开着只会让 URL 里的无关参数被误判成 token
 * - 空闲过期不在这里做，见 src/lib/session.ts（由 AuthContext 驱动）
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    storageKey: 'scau-water-auth',
  },
});
