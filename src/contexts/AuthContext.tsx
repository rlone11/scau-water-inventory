import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { UserRole } from '../types';
import { getCurrentRole, setCurrentRole, getAdminPassword, setAdminPassword } from '../utils/storage';

interface AuthContextType {
  role: UserRole;
  isAdmin: boolean;
  hasPassword: boolean;
  login: (password: string) => boolean;
  logout: () => void;
  setFirstPassword: (password: string) => void;
  switchToUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>(() => {
    const saved = getCurrentRole();
    if (saved === 'admin') return 'admin';
    return null;
  });

  const [hasPassword, setHasPassword] = useState(() => !!getAdminPassword());

  useEffect(() => {
    setCurrentRole(role);
  }, [role]);

  const login = useCallback((password: string): boolean => {
    const stored = getAdminPassword();
    if (stored && stored === password) {
      setRole('admin');
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setRole(null);
  }, []);

  const setFirstPassword = useCallback((password: string) => {
    setAdminPassword(password);
    setHasPassword(true);
    setRole('admin');
  }, []);

  const switchToUser = useCallback(() => {
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        role,
        isAdmin: role === 'admin',
        hasPassword,
        login,
        logout,
        setFirstPassword,
        switchToUser,
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
