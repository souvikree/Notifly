'use client';

import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  tenantId: string;
  isActive: boolean;
}

interface AuthContextType {
  tenantId: string | null;
  adminUser: AdminUser | null;
  jwtToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string, tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth from localStorage and validate token
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedTenantId = localStorage.getItem('tenant_id');
        const storedToken = localStorage.getItem('jwt_token');

        if (storedTenantId && storedToken) {
          // Validate token
          try {
            const response = await fetch('/api/auth/validate', {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${storedToken}`,
              },
            });

            if (response.ok) {
              const data = await response.json();
              if (data.valid && data.user) {
                setTenantId(storedTenantId);
                setJwtToken(storedToken);
                setAdminUser(data.user);
              } else {
                // Token invalid, clear storage
                localStorage.removeItem('jwt_token');
                localStorage.removeItem('tenant_id');
                localStorage.removeItem('admin_user');
              }
            } else if (response.status === 401) {
              // Token expired, try to refresh
              const refreshResponse = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${storedToken}`,
                },
              });

              if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();
                if (refreshData.success && refreshData.token) {
                  setJwtToken(refreshData.token);
                  localStorage.setItem('jwt_token', refreshData.token);
                  setTenantId(storedTenantId);
                  
                  // Fetch user data with new token
                  const userResponse = await fetch('/api/auth/validate', {
                    method: 'GET',
                    headers: {
                      Authorization: `Bearer ${refreshData.token}`,
                    },
                  });
                  
                  if (userResponse.ok) {
                    const userData = await userResponse.json();
                    if (userData.valid) {
                      setAdminUser(userData.user);
                    }
                  }
                }
              } else {
                // Refresh failed, clear storage
                localStorage.removeItem('jwt_token');
                localStorage.removeItem('tenant_id');
                localStorage.removeItem('admin_user');
              }
            }
          } catch (err) {
            console.error('Token validation error:', err);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = useCallback(async (email: string, password: string, tenantId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Login failed');
      }

      const { token, user } = data;

      setJwtToken(token);
      setTenantId(tenantId);
      setAdminUser(user);

      localStorage.setItem('jwt_token', token);
      localStorage.setItem('tenant_id', tenantId);
      localStorage.setItem('admin_user', JSON.stringify(user));

      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const register = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    tenantId: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          tenantId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Registration failed');
      }

      const { token, user } = data;

      setJwtToken(token);
      setTenantId(tenantId);
      setAdminUser(user);

      localStorage.setItem('jwt_token', token);
      localStorage.setItem('tenant_id', tenantId);
      localStorage.setItem('admin_user', JSON.stringify(user));

      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (jwtToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setTenantId(null);
      setAdminUser(null);
      setJwtToken(null);

      localStorage.removeItem('tenant_id');
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('admin_user');

      setLoading(false);
      router.push('/login');
    }
  }, [jwtToken, router]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setError(null);

    try {
      if (!jwtToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to change password');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
      setError(message);
      throw err;
    }
  }, [jwtToken]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    tenantId,
    adminUser,
    jwtToken,
    isAuthenticated: !!(tenantId && jwtToken && adminUser),
    loading,
    error,
    login,
    register,
    logout,
    changePassword,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
