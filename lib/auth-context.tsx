"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { AuthUser, AuthResponse, LoginRequest, RegisterRequest } from "./types";
import { authService } from "./api-services";
import { toast } from "sonner";

interface AuthContextType {
  user:            AuthUser | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  login:           (data: LoginRequest) => Promise<void>;
  register:        (data: RegisterRequest) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Cookie helpers (needed for middleware edge access) ────────────────────────
function setCookie(name: string, value: string, days = 1) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

// ── Map the backend AuthResponse → AuthUser ───────────────────────────────────
function toAuthUser(r: AuthResponse): AuthUser {
  return {
    id:           r.userId,
    email:        r.email,
    firstName:    r.firstName,
    lastName:     r.lastName,
    role:         r.role,
    tenantId:     r.tenantId,
    avatarUrl:    r.avatarUrl,
    authProvider: r.authProvider,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("notifly_user");
    const token  = localStorage.getItem("notifly_access_token");
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem("notifly_user");
      }
    }
    setIsLoading(false);
  }, []);

  // Persist auth state in localStorage + cookie
  const persist = useCallback((response: AuthResponse) => {
    const u = toAuthUser(response);
    localStorage.setItem("notifly_access_token",  response.accessToken);
    localStorage.setItem("notifly_refresh_token", response.refreshToken);
    localStorage.setItem("notifly_user",          JSON.stringify(u));
    setCookie("notifly_access_token", response.accessToken, 1);
    setUser(u);
  }, []);

  // Clear all auth state
  const clearAuth = useCallback(() => {
    localStorage.removeItem("notifly_access_token");
    localStorage.removeItem("notifly_refresh_token");
    localStorage.removeItem("notifly_user");
    deleteCookie("notifly_access_token");
    setUser(null);
  }, []);

  // ── Email / password login ─────────────────────────────────────────────────
  const login = useCallback(async (data: LoginRequest) => {
    const response = await authService.login(data);
    persist(response);
    toast.success(`Welcome back, ${response.firstName}!`);
  }, [persist]);

  // ── Email / password registration ──────────────────────────────────────────
  const register = useCallback(async (data: RegisterRequest) => {
    const response = await authService.register(data);
    persist(response);
    toast.success("Account created successfully!");
  }, [persist]);

  // ── Google OAuth ───────────────────────────────────────────────────────────
  // `idToken` is the credential string from @react-oauth/google's onSuccess callback
  const loginWithGoogle = useCallback(async (idToken: string) => {
    const response = await authService.googleAuth(idToken);
    persist(response);
    const isNew = !response.authProvider || response.authProvider === "GOOGLE";
    toast.success(isNew
      ? `Welcome to Notifly, ${response.firstName}!`
      : `Welcome back, ${response.firstName}!`
    );
  }, [persist]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem("notifly_refresh_token");
    try {
      if (refreshToken) {
        await authService.logout(refreshToken); // invalidate server-side
      }
    } catch {
      // Ignore — clear local state regardless
    } finally {
      clearAuth();
      toast.success("Logged out successfully.");
    }
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      loginWithGoogle,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}