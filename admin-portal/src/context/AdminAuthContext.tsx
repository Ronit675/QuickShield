import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { AdminUser } from '../types/admin';
import { adminStorage, api } from '../lib/api';

type SessionPayload = {
  accessToken: string;
  refreshToken?: string;
  admin: AdminUser;
};

type AdminAuthContextValue = {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  persistSession: (payload: SessionPayload) => void;
  updateUser: (admin: AdminUser) => void;
  logout: () => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCurrentAdmin = async () => {
      const accessToken = localStorage.getItem(adminStorage.accessTokenKey);

      if (!accessToken) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await api.get<AdminUser>('/admin/auth/me');
        localStorage.setItem(adminStorage.userKey, JSON.stringify(data));
        setUser(data);
      } catch {
        localStorage.removeItem(adminStorage.accessTokenKey);
        localStorage.removeItem(adminStorage.refreshTokenKey);
        localStorage.removeItem(adminStorage.userKey);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadCurrentAdmin();
  }, []);

  const persistSession = (payload: SessionPayload) => {
    localStorage.setItem(adminStorage.accessTokenKey, payload.accessToken);
    if (payload.refreshToken) {
      localStorage.setItem(adminStorage.refreshTokenKey, payload.refreshToken);
    }
    localStorage.setItem(adminStorage.userKey, JSON.stringify(payload.admin));
    setUser(payload.admin);
  };

  const updateUser = (admin: AdminUser) => {
    localStorage.setItem(adminStorage.userKey, JSON.stringify(admin));
    setUser(admin);
  };

  const logout = () => {
    localStorage.removeItem(adminStorage.accessTokenKey);
    localStorage.removeItem(adminStorage.refreshTokenKey);
    localStorage.removeItem(adminStorage.userKey);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      persistSession,
      updateUser,
      logout,
    }),
    [isLoading, user],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  }
  return context;
}
