const KEYS = {
  ADMIN_PWD: 'scau_admin_pwd',
  CURRENT_ROLE: 'scau_current_role',
} as const;

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
