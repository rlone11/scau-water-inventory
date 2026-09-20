import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import type { ScauRole } from '../types';
import { supabase } from '../lib/supabase';
import { cacheClear } from '../lib/cache';
import { isIdleExpired, clearActivity, startActivityTracking } from '../lib/session';
import {
  getGuestIdentity,
  setGuestIdentity,
  clearGuestIdentity,
  type GuestIdentity,
} from '../utils/storage';

/**
 * 三种身份，判定顺序：
 *   1. 有 Supabase 会话 → 看 app_metadata.scau_role（由钉钉登录写入）
 *   2. 没有会话但有本地访客身份 → guest
 *   3. 都没有 → null（路由守卫会弹回登录页）
 *
 * 2026-09-20 之前这里是一个硬编码的密码 `0313` + localStorage 里的永久角色。
 * 现在前端只是个分流器，真正的门在数据库 RLS 上 —— 就算有人改前端代码，
 * 没有会话也读不到任何借用记录。
 */
export interface AuthContextType {
  /** null = 未登录 */
  role: ScauRole | null;
  isAdmin: boolean;
  /** 顶栏显示用：钉钉昵称，或访客自填的姓名 */
  displayName: string | null;
  /** 访客身份，非访客为 null */
  guest: GuestIdentity | null;
  /** 首次会话读取中。守卫必须等它结束，否则刷新页面会闪一下登录页 */
  loading: boolean;
  signOut: () => Promise<void>;
  /** 访客入口：刻意不做任何验证，只记下姓名和电话 */
  signInAsGuest: (identity: GuestIdentity) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** 闲置检查的轮询间隔 —— 页面一直开着时也能按时踢下线 */
const IDLE_CHECK_INTERVAL_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  /**
   * ⚠️ 必须在任何 touchActivity 之前判定。
   * 否则「闲置很久后重新打开页面」会先把时间戳刷新成现在，
   * 过期检查就永远不触发了 —— 前一个人登着没退出，后一个人打开
   * 直接就是他的身份。
   */
  const [idleExpired] = useState(() => isIdleExpired());

  const [user, setUser] = useState<User | null>(null);
  const [guest, setGuest] = useState<GuestIdentity | null>(() =>
    idleExpired ? null : getGuestIdentity(),
  );
  const [loading, setLoading] = useState(true);

  // ── 初始化：空闲过期处理 + 读取会话
  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const init = async () => {
      if (idleExpired) {
        clearActivity();
        clearGuestIdentity();
        await supabase.auth.signOut().catch(() => {});
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    void init();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [idleExpired]);

  // ── 活动跟踪 + 空闲轮询
  useEffect(() => {
    const stopTracking = startActivityTracking();

    const timer = window.setInterval(() => {
      if (!isIdleExpired()) return;
      // 页面一直开着、人走了两小时 —— 这里把它踢下线
      cacheClear();
      clearActivity();
      clearGuestIdentity();
      setGuest(null);
      void supabase.auth.signOut().catch(() => {});
      setUser(null);
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      stopTracking();
      window.clearInterval(timer);
    };
  }, []);

  const signOut = useCallback(async () => {
    /**
     * ⚠️ 内存缓存必须一起清。
     * src/lib/cache.ts 是模块级 Map，不清的话下一个登录的人
     * 会读到上一个人留下的物品和记录列表。
     */
    cacheClear();
    clearActivity();
    clearGuestIdentity();
    setGuest(null);
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
  }, []);

  const signInAsGuest = useCallback((identity: GuestIdentity) => {
    setGuestIdentity(identity);
    setGuest(identity);
  }, []);

  const role: ScauRole | null = user
    ? user.app_metadata?.scau_role === 'admin'
      ? 'admin'
      : 'internal'
    : guest
      ? 'guest'
      : null;

  const displayName = user
    ? ((user.app_metadata?.name as string | undefined) ?? '未命名')
    : (guest?.name ?? null);

  return (
    <AuthContext.Provider
      value={{
        role,
        isAdmin: role === 'admin',
        displayName,
        guest,
        loading,
        signOut,
        signInAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
