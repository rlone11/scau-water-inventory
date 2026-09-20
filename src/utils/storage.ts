/**
 * 本地存储。
 *
 * 2026-09-20 移除了管理员密码相关函数（`scau_admin_pwd` / `scau_current_role`）——
 * 密码曾以明文存在浏览器里、且硬编码在源码中，现改由钉钉扫码 + Supabase 会话承担，
 * 真正的门在数据库 RLS 上。
 */

const KEYS = {
  /** 访客身份。访客没有 Supabase 会话，这是他们唯一的本地凭据 */
  GUEST: 'scau_guest_identity',
} as const;

// ────────────────────────────────────────────── 访客身份

export interface GuestIdentity {
  name: string;
  phone: string;
}

/**
 * 读访客身份。解析失败一律当成没有 ——
 * 存储里的内容可能是用户手改的，不能信任。
 */
export function getGuestIdentity(): GuestIdentity | null {
  try {
    const raw = localStorage.getItem(KEYS.GUEST);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as GuestIdentity).name === 'string' &&
      typeof (parsed as GuestIdentity).phone === 'string'
    ) {
      const { name, phone } = parsed as GuestIdentity;
      if (!name.trim() || !phone.trim()) return null;
      return { name, phone };
    }
    return null;
  } catch {
    return null;
  }
}

export function setGuestIdentity(identity: GuestIdentity): void {
  try {
    localStorage.setItem(KEYS.GUEST, JSON.stringify(identity));
  } catch {
    /* 隐私模式下写不了，忽略 —— 本次会话仍然可用，只是刷新后要重填 */
  }
}

export function clearGuestIdentity(): void {
  try {
    localStorage.removeItem(KEYS.GUEST);
  } catch {
    /* 同上 */
  }
}

// ────────────────────────────────────────────── 通用工具

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function nowISO(): string {
  return new Date().toISOString();
}
