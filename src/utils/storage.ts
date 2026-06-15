const KEYS = {
  ITEMS: 'scau_items',
  RECORDS: 'scau_records',
  ADMIN_PWD: 'scau_admin_pwd',
  CURRENT_ROLE: 'scau_current_role',
} as const;

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Items
import type { Item, BorrowRecord } from '../types';

export function getItems(): Item[] {
  return get<Item[]>(KEYS.ITEMS, []);
}

export function saveItems(items: Item[]): void {
  set(KEYS.ITEMS, items);
}

// Records
export function getRecords(): BorrowRecord[] {
  return get<BorrowRecord[]>(KEYS.RECORDS, []);
}

export function saveRecords(records: BorrowRecord[]): void {
  set(KEYS.RECORDS, records);
}

// Admin password - stored as plain text (simple approach for local use)
export function getAdminPassword(): string | null {
  return localStorage.getItem(KEYS.ADMIN_PWD);
}

export function setAdminPassword(password: string): void {
  localStorage.setItem(KEYS.ADMIN_PWD, password);
}

// Current role
export function getCurrentRole(): string | null {
  return localStorage.getItem(KEYS.CURRENT_ROLE);
}

export function setCurrentRole(role: string | null): void {
  if (role) {
    localStorage.setItem(KEYS.CURRENT_ROLE, role);
  } else {
    localStorage.removeItem(KEYS.CURRENT_ROLE);
  }
}

// Helpers
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function nowISO(): string {
  return new Date().toISOString();
}
